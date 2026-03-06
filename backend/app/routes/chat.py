"""Chat routes with document-aware AI responses."""
import logging
import time
from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import uuid4

import httpx
from fastapi import (
    APIRouter, Depends, HTTPException, Query, status,
)
from pydantic import BaseModel

from app.config import settings
from app.core.auth import get_current_user
from app.core.exceptions import NotFoundError
from app.services.firebase import get_db
from app.services.ai import ai_service
from app.services.storage import download_from_storage
from app.services.analysis import analysis_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])


# ===================
# Request/Response Models
# ===================

class ConversationCreate(BaseModel):
    """Create conversation request."""
    title: str = "New Conversation"
    document_id: Optional[str] = None


class ConversationResponse(BaseModel):
    """Conversation response model."""
    id: str
    title: str
    document_id: Optional[str] = None
    document_filename: Optional[str] = None
    expert_used: Optional[str] = None
    created_at: str
    updated_at: str


class MessageCreate(BaseModel):
    """Send message request."""
    content: str
    document_ids: Optional[List[str]] = None


class MessageResponse(BaseModel):
    """Message response model."""
    model_config = {"protected_namespaces": ()}
    
    id: str
    role: str
    content: str
    model_used: Optional[str] = None
    tokens_used: Optional[int] = None
    latency_ms: Optional[int] = None
    has_document_context: Optional[bool] = None
    created_at: str


class ConversationWithMessages(ConversationResponse):
    """Conversation with all messages."""
    messages: List[MessageResponse]


# ===================
# Helper Functions
# ===================

async def get_conversation_with_auth(
    conversation_id: str,
    user_id: str,
) -> Dict[str, Any]:
    """Get conversation and verify ownership."""
    db = get_db()
    conv_ref = db.collection("conversations").document(conversation_id)
    conv_doc = conv_ref.get()
    
    if not conv_doc.exists:
        raise NotFoundError("Conversation")
    
    conv_data = conv_doc.to_dict()
    
    if conv_data.get("user_id") != user_id:
        raise NotFoundError("Conversation")
    
    return conv_data


async def get_document_context(document_id: str, user_id: str) -> Optional[str]:
    """
    Fetch document OCR text for AI context.
    
    Returns formatted document context string or None.
    """
    if not document_id:
        return None
    
    db = get_db()
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        logger.warning(f"Document not found for context: {document_id}")
        return None
    
    doc_data = doc.to_dict()
    
    # Verify ownership
    if doc_data.get("user_id") != user_id:
        logger.warning(f"Document ownership mismatch: {document_id}")
        return None
    
    ocr_text = doc_data.get("ocr_text", "")
    if not ocr_text or not ocr_text.strip():
        logger.info(f"Document has no OCR text: {document_id}")
        return None
    
    # Format context with document metadata
    filename = doc_data.get("filename", "Unknown Document")
    doc_type = doc_data.get("document_type", "document")
    
    context = (
        f"=== MEDICAL DOCUMENT ===\n"
        f"Filename: {filename}\n"
        f"Type: {doc_type}\n"
        f"========================\n\n"
        f"{ocr_text}"
    )
    
    logger.info(
        f"Loaded document context: {document_id} "
        f"({len(ocr_text)} chars, type: {doc_type})"
    )
    
    return context


async def get_all_user_documents_context(user_id: str) -> Optional[str]:
    """
    Fetch OCR text from ALL user's documents for AI context.
    
    Used when no specific document is linked to a conversation,
    so the AI can still reference the user's uploaded documents.
    
    Returns formatted multi-document context string or None.
    """
    db = get_db()
    
    query = db.collection("documents").where("user_id", "==", user_id)
    docs = [d.to_dict() for d in query.stream()]
    
    # Filter: only docs with status != deleted and with OCR text
    docs_with_text = [
        d for d in docs
        if d.get("status") != "deleted"
        and d.get("ocr_text", "").strip()
    ]
    
    if not docs_with_text:
        logger.info(f"No documents with OCR text found for user {user_id}")
        return None
    
    # Sort by created_at descending (newest first)
    docs_with_text.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    
    # Build combined context (limit to avoid token overflow)
    context_parts = []
    total_chars = 0
    max_chars = 12000  # ~3000 tokens budget for document context
    
    for doc in docs_with_text:
        ocr_text = doc.get("ocr_text", "")
        filename = doc.get("filename", "Unknown")
        doc_type = doc.get("document_type", "document")
        
        # Check if adding this doc would exceed limit
        doc_header = (
            f"\n--- DOCUMENT: {filename} (Type: {doc_type}) ---\n"
        )
        remaining = max_chars - total_chars - len(doc_header)
        
        if remaining <= 200:
            break
        
        # Truncate OCR text if needed  
        text_to_add = ocr_text[:remaining] if len(ocr_text) > remaining else ocr_text
        
        context_parts.append(f"{doc_header}{text_to_add}")
        total_chars += len(doc_header) + len(text_to_add)
    
    if not context_parts:
        return None
    
    doc_count = len(context_parts)
    context = (
        f"=== USER'S MEDICAL DOCUMENTS ({doc_count} document(s)) ===\n"
        + "\n".join(context_parts)
        + "\n\n=== END OF DOCUMENTS ==="
    )
    
    logger.info(
        f"Loaded {doc_count} documents as context for user {user_id} "
        f"({total_chars} total chars)"
    )
    
    return context


async def get_selected_documents_context(
    document_ids: List[str], user_id: str
) -> Optional[str]:
    """
    Fetch OCR text from user-selected documents only.
    
    Args:
        document_ids: List of document IDs the user selected in the panel
        user_id: The authenticated user's ID
        
    Returns formatted multi-document context string or None.
    """
    if not document_ids:
        return None

    db = get_db()
    context_parts = []
    total_chars = 0
    max_chars = 12000

    for doc_id in document_ids:
        doc_ref = db.collection("documents").document(doc_id)
        doc = doc_ref.get()

        if not doc.exists:
            continue

        doc_data = doc.to_dict()

        # Verify ownership
        if doc_data.get("user_id") != user_id:
            continue

        if doc_data.get("status") == "deleted":
            continue

        ocr_text = doc_data.get("ocr_text", "")
        filename = doc_data.get("filename", "Unknown")
        doc_type = doc_data.get("document_type", "document")

        doc_header = f"\n--- DOCUMENT: {filename} (Type: {doc_type}) ---\n"
        remaining = max_chars - total_chars - len(doc_header)

        if remaining <= 200:
            break

        if not ocr_text or not ocr_text.strip():
            # Still include the document so AI knows it was selected
            note = (
                f"[Text extraction was not available for this document. "
                f"File: {filename}, Type: {doc_type}, "
                f"Size: {doc_data.get('file_size', 'unknown')} bytes]"
            )
            context_parts.append(f"{doc_header}{note}")
            total_chars += len(doc_header) + len(note)
        else:
            text_to_add = ocr_text[:remaining] if len(ocr_text) > remaining else ocr_text
            context_parts.append(f"{doc_header}{text_to_add}")
            total_chars += len(doc_header) + len(text_to_add)

    if not context_parts:
        return None

    doc_count = len(context_parts)
    context = (
        f"=== SELECTED MEDICAL DOCUMENTS ({doc_count} document(s)) ===\n"
        + "\n".join(context_parts)
        + "\n\n=== END OF DOCUMENTS ==="
    )

    logger.info(
        f"Built context from {doc_count} selected documents "
        f"({total_chars} chars)"
    )

    return context


# ===================
# Routes
# ===================

@router.post("", status_code=status.HTTP_201_CREATED, response_model=ConversationResponse)
async def create_conversation(
    request: ConversationCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Create a new conversation.
    
    Optionally link to a document for context-aware responses.
    
    - **title**: Conversation title
    - **document_id**: Optional document ID to link for context
    """
    db = get_db()
    user_id = current_user["id"]
    
    # Validate document if provided
    document_filename = None
    if request.document_id:
        doc_ref = db.collection("documents").document(request.document_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            raise NotFoundError("Document")
        
        doc_data = doc.to_dict()
        if doc_data.get("user_id") != user_id:
            raise NotFoundError("Document")
        
        document_filename = doc_data.get("filename")
        logger.info(f"Conversation linked to document: {request.document_id}")
    
    # Create conversation
    conv_id = str(uuid4())
    now = datetime.utcnow().isoformat()
    
    conv_data = {
        "id": conv_id,
        "user_id": user_id,
        "title": request.title or "New Conversation",
        "document_id": request.document_id,
        "document_filename": document_filename,
        "expert_used": None,
        "created_at": now,
        "updated_at": now,
    }
    
    db.collection("conversations").document(conv_id).set(conv_data)
    
    logger.info(
        f"Conversation created: {conv_id}, "
        f"document_id={request.document_id}"
    )
    
    return ConversationResponse(**conv_data)


@router.get("", response_model=List[ConversationResponse])
async def list_conversations(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """List user's conversations with pagination."""
    db = get_db()
    user_id = current_user["id"]
    
    # Get all conversations
    query = db.collection("conversations").where("user_id", "==", user_id)
    all_convs = [doc.to_dict() for doc in query.stream()]
    
    # Sort by updated_at descending
    all_convs.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
    
    # Paginate
    start = (page - 1) * per_page
    end = start + per_page
    page_convs = all_convs[start:end]
    
    return [ConversationResponse(**c) for c in page_convs]


@router.get("/{conversation_id}", response_model=ConversationWithMessages)
async def get_conversation(
    conversation_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get conversation with all messages."""
    user_id = current_user["id"]
    conv_data = await get_conversation_with_auth(conversation_id, user_id)
    
    # Get messages
    db = get_db()
    msgs_query = (
        db.collection("conversations")
        .document(conversation_id)
        .collection("messages")
        .order_by("created_at")
    )
    
    messages = []
    for msg in msgs_query.stream():
        msg_data = msg.to_dict()
        messages.append(MessageResponse(
            id=msg_data["id"],
            role=msg_data["role"],
            content=msg_data["content"],
            model_used=msg_data.get("model_used"),
            tokens_used=msg_data.get("tokens_used"),
            latency_ms=msg_data.get("latency_ms"),
            has_document_context=msg_data.get("has_document_context"),
            created_at=msg_data["created_at"],
        ))
    
    return ConversationWithMessages(
        **conv_data,
        messages=messages,
    )


@router.post("/{conversation_id}/message", response_model=MessageResponse)
async def send_message(
    conversation_id: str,
    request: MessageCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Send a message and get AI response.
    
    If the conversation is linked to a document, the AI will have
    access to the document content for context-aware responses.
    """
    db = get_db()
    user_id = current_user["id"]
    start_time = time.time()

    # Get and validate conversation
    conv_data = await get_conversation_with_auth(conversation_id, user_id)
    conv_ref = db.collection("conversations").document(conversation_id)

    # Collect document IDs to use
    doc_ids = list(request.document_ids or [])
    if not doc_ids:
        linked_doc_id = conv_data.get("document_id")
        if linked_doc_id:
            doc_ids = [linked_doc_id]

    logger.info(f"Chat request: doc_ids={doc_ids}, conv={conversation_id}")

    # ── Save user message ─────────────────────────────────────────
    user_msg_id = str(uuid4())
    now = datetime.utcnow().isoformat()
    user_msg = {
        "id": user_msg_id,
        "role": "user",
        "content": request.content,
        "created_at": now,
    }
    conv_ref.collection("messages").document(user_msg_id).set(user_msg)

    # ── Gather cached analyses ────────────────────────────────────
    analyses_context: list[str] = []
    for doc_id in doc_ids:
        try:
            doc_snap = db.collection("documents").document(doc_id).get()
            if not doc_snap.exists:
                continue
            doc_data = doc_snap.to_dict()
            if doc_data.get("user_id") != user_id:
                continue

            filename = doc_data.get("filename", "unknown")

            # Try cached analysis first
            analysis = await analysis_service.get_analysis(doc_id, db)

            if not analysis:
                # Not analyzed yet — generate on-demand
                logger.info(
                    f"No cached analysis for {filename}, generating now..."
                )
                analysis = await analysis_service.analyze_document(
                    doc_id, user_id, doc_data, db,
                )

            if analysis:
                analyses_context.append(f"=== {filename} ===\n{analysis}")
                logger.info(
                    f"Using analysis for {filename} ({len(analysis)} chars)"
                )
        except Exception as e:
            logger.error(f"Error loading document {doc_id}: {e}")

    # ── Build AI messages ─────────────────────────────────────────
    if analyses_context:
        combined = "\n\n".join(analyses_context)
        system_prompt = (
            "You are CareBridge AI, a medical assistant. "
            "The user's medical documents have already been analyzed. "
            "The complete analysis is provided below.\n\n"
            f"DOCUMENT ANALYSIS:\n{combined}\n\n"
            "INSTRUCTIONS:\n"
            "- Answer the user's question using ONLY the analysis above\n"
            "- Do not make up information not in the analysis\n"
            "- Use **bold** for headings and important findings\n"
            "- Be clear and direct\n"
            "- If the user asks something not covered, say so honestly\n"
            "- Do NOT add any medical disclaimer — it will be added "
            "automatically"
        )
    else:
        system_prompt = (
            "You are CareBridge AI, a helpful medical information "
            "assistant.\nAnswer health-related questions clearly and "
            "accurately.\nUse **bold** for headings and important points.\n"
            "Do NOT add any medical disclaimer — it will be added "
            "automatically."
        )

    # Conversation history (last messages)
    history_docs = conv_ref.collection("messages").order_by("created_at").stream()
    history = [
        {"role": m.to_dict()["role"], "content": m.to_dict()["content"]}
        for m in history_docs
    ]

    # Check if this is the first assistant reply (for disclaimer)
    has_prior_assistant = any(m["role"] == "assistant" for m in history)

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    if len(history) > 1:
        messages.extend(history[-6:-1])
    messages.append({"role": "user", "content": request.content})

    # ── Call AI ────────────────────────────────────────────────────
    reply = await _call_chat_ai(messages)
    elapsed = time.time() - start_time
    logger.info(
        f"Chat response in {elapsed:.1f}s | "
        f"docs={len(doc_ids)} | cached={len(analyses_context)}"
    )

    # Sanitize — only add disclaimer on first AI reply
    reply = ai_service.safety.sanitize_response(
        reply, add_disclaimer=not has_prior_assistant
    )

    # Save assistant message
    asst_msg_id = str(uuid4())
    asst_now = datetime.utcnow().isoformat()
    asst_msg = {
        "id": asst_msg_id,
        "role": "assistant",
        "content": reply,
        "model_used": "MediX-R1-8B",
        "latency_ms": int(elapsed * 1000),
        "has_document_context": bool(analyses_context),
        "created_at": asst_now,
    }
    conv_ref.collection("messages").document(asst_msg_id).set(asst_msg)

    conv_ref.update({
        "updated_at": asst_now,
    })

    logger.info(
        f"Chat response: conversation={conversation_id}, "
        f"has_doc={bool(analyses_context)}, latency={int(elapsed*1000)}ms"
    )

    return MessageResponse(
        id=asst_msg_id,
        role="assistant",
        content=reply,
        model_used="MediX-R1-8B",
        latency_ms=int(elapsed * 1000),
        has_document_context=bool(analyses_context),
        created_at=asst_now,
    )


# ── Chat AI helper ───────────────────────────────────────────────

async def _call_chat_ai(messages: list) -> str:
    """Call the AI for a chat response (text-only, no images)."""
    try:
        if settings.AI_PROVIDER == "local":
            url = f"{settings.LLAMA_SERVER_URL}/v1/chat/completions"
            payload = {
                "messages": messages,
                "max_tokens": 4096,
                "temperature": 0.5,
                "top_p": 0.9,
            }
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    content = (
                        data.get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                    )
                    if "<think>" in content and "</think>" in content:
                        content = content.split("</think>")[-1].strip()
                    return content
                logger.error(f"llama-server error: {resp.status_code}")
                return "Sorry, I encountered an error processing your request."
        else:
            url = f"{settings.HF_INFERENCE_URL}/v1/chat/completions"
            headers = {"Authorization": f"Bearer {settings.HF_API_KEY}"}
            payload = {
                "model": settings.HF_MODEL,
                "messages": messages,
                "max_tokens": 4096,
                "temperature": 0.5,
            }
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return (
                        data.get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                    )
                logger.error(f"HF API error: {resp.status_code}")
                return "Sorry, I encountered an error processing your request."
    except Exception as e:
        logger.error(f"Chat AI call failed: {e}")
        return "Sorry, I encountered an error. Please try again."


@router.put("/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    title: str = Query(..., description="New conversation title"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Update conversation title."""
    user_id = current_user["id"]
    await get_conversation_with_auth(conversation_id, user_id)
    
    db = get_db()
    db.collection("conversations").document(conversation_id).update({
        "title": title,
        "updated_at": datetime.utcnow().isoformat(),
    })
    
    return {"message": "Conversation updated", "id": conversation_id}


@router.put("/{conversation_id}/link-document")
async def link_document_to_conversation(
    conversation_id: str,
    document_id: str = Query(..., description="Document ID to link"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Link a document to an existing conversation.
    
    This enables document-aware AI responses for the conversation.
    """
    db = get_db()
    user_id = current_user["id"]
    
    # Validate conversation
    await get_conversation_with_auth(conversation_id, user_id)
    
    # Validate document
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise NotFoundError("Document")
    
    doc_data = doc.to_dict()
    if doc_data.get("user_id") != user_id:
        raise NotFoundError("Document")
    
    # Link document
    db.collection("conversations").document(conversation_id).update({
        "document_id": document_id,
        "document_filename": doc_data.get("filename"),
        "updated_at": datetime.utcnow().isoformat(),
    })
    
    logger.info(f"Linked document {document_id} to conversation {conversation_id}")
    
    return {
        "message": "Document linked successfully",
        "conversation_id": conversation_id,
        "document_id": document_id,
        "document_filename": doc_data.get("filename"),
    }


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete conversation and all messages."""
    db = get_db()
    user_id = current_user["id"]
    
    await get_conversation_with_auth(conversation_id, user_id)
    
    conv_ref = db.collection("conversations").document(conversation_id)
    
    # Delete messages subcollection
    for msg in conv_ref.collection("messages").stream():
        msg.reference.delete()
    
    # Delete conversation
    conv_ref.delete()
    
    logger.info(f"Conversation deleted: {conversation_id}")
    
    return {"message": "Conversation deleted", "id": conversation_id}
