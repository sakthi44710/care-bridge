"""
Voice chat WebSocket route – integrated into the main FastAPI backend.

Endpoint: /api/v1/voice/chat/stream  (WebSocket)

Query params:
  - user_id   : Firebase UID
  - document_ids : comma-separated doc IDs (optional)

Accepts JSON messages over WS:
  { "type": "text"|"audio", "content": "...", "mime_type": "audio/webm" }

Returns JSON:
  { "text": "...", "audio": "<base64>", "audio_mime": "audio/wav" }
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.voice_session import session_manager
from app.services.voice_agent import process_chat

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Voice"])


async def _fetch_document_analyses(user_id: str, document_ids: Optional[list[str]] = None) -> list[dict]:
    """Fetch completed document analyses from Firestore for the given user."""
    try:
        from app.services.firebase import get_db

        db = get_db()
        if not db:
            logger.warning("Firestore client not available for voice service")
            return []

        docs_ref = db.collection("documents").where("user_id", "==", user_id)
        docs = docs_ref.stream()

        analyses = []
        for doc in docs:
            doc_data = doc.to_dict()
            doc_id = doc.id

            if document_ids and doc_id not in document_ids:
                continue

            analysis_ref = db.collection("document_analyses").document(doc_id)
            analysis_doc = analysis_ref.get()

            if analysis_doc.exists:
                analysis_data = analysis_doc.to_dict()
                analysis_txt = analysis_data.get("analysis") or analysis_data.get("analysis_text") or ""
                if analysis_data.get("status") == "completed" and analysis_txt:
                    analyses.append({
                        "filename": doc_data.get("filename", f"Document {doc_id}"),
                        "document_type": doc_data.get("document_type", "general"),
                        "analysis_text": analysis_txt,
                    })

        logger.info(f"Fetched {len(analyses)} document analyses for voice (user {user_id})")
        return analyses

    except Exception as e:
        logger.error(f"Failed to fetch document analyses: {e}")
        return []


@router.websocket("/chat/stream")
async def voice_websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for voice/text chat with Gemini + TTS."""
    await websocket.accept()
    session_id = session_manager.create_session()

    # Query params
    user_id = websocket.query_params.get("user_id", "")
    doc_ids_param = websocket.query_params.get("document_ids", "")
    document_ids = [d.strip() for d in doc_ids_param.split(",") if d.strip()] if doc_ids_param else None

    logger.info(f"Voice WS connected. Session: {session_id}, User: {user_id}, Docs: {document_ids}")

    # Pre-fetch analyses at connection time
    document_analyses: list[dict] = []
    if user_id:
        document_analyses = await _fetch_document_analyses(user_id, document_ids)
        logger.info(f"Loaded {len(document_analyses)} analyses for voice session")

    try:
        while True:
            data_str = await websocket.receive_text()

            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON format."})
                continue

            user_input_type = data.get("type")
            user_content = data.get("content")

            # Allow per-message document_ids refresh
            msg_doc_ids = data.get("document_ids")
            if msg_doc_ids and user_id:
                document_analyses = await _fetch_document_analyses(user_id, msg_doc_ids)

            if user_input_type not in ("text", "audio") or not user_content:
                await websocket.send_json({"error": "Payload must include 'type' (text/audio) and 'content'."})
                continue

            logger.info(f"Voice WS [{session_id[:8]}] received {user_input_type} message")

            current_history = session_manager.get_history(session_id)

            audio_mime_in = data.get("mime_type", "audio/webm")
            text_resp, audio_b64, audio_mime, updated_history = await process_chat(
                current_history,
                user_input_type,
                user_content,
                document_analyses=document_analyses,
                audio_mime_type=audio_mime_in,
            )

            session_manager.update_history(session_id, updated_history)

            await websocket.send_json({
                "text": text_resp,
                "audio": audio_b64,
                "audio_mime": audio_mime,
            })

    except WebSocketDisconnect:
        logger.info(f"Voice WS disconnected: {session_id}")
        session_manager.end_session(session_id)
    except Exception as e:
        logger.error(f"Voice WS error: {e}")
        session_manager.end_session(session_id)
