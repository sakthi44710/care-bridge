from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import json
import logging
import os
import sys

from session_manager import session_manager
from agent import process_chat

# Add parent directory to path so we can import from main backend app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

app = FastAPI(title="CareBridge Voice Microservice")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("uvicorn.error")

# Serve the test UI
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


async def _fetch_document_analyses(user_id: str, document_ids: list[str] | None = None) -> list[dict]:
    """Fetch document analyses from Firestore for the given user."""
    try:
        from app.services.firebase import get_db
        db = get_db()
        if not db:
            logger.warning("Firestore client not available for voice service")
            return []

        # Get user's documents
        docs_ref = db.collection("documents").where("user_id", "==", user_id)
        docs = docs_ref.stream()

        analyses = []
        for doc in docs:
            doc_data = doc.to_dict()
            doc_id = doc.id

            # If specific document_ids provided, filter
            if document_ids and doc_id not in document_ids:
                continue

            # Fetch analysis from document_analyses collection
            analysis_ref = db.collection("document_analyses").document(doc_id)
            analysis_doc = analysis_ref.get()

            if analysis_doc.exists:
                analysis_data = analysis_doc.to_dict()
                # Field is stored as 'analysis' by the analysis service
                analysis_txt = analysis_data.get("analysis") or analysis_data.get("analysis_text") or ""
                if analysis_data.get("status") == "completed" and analysis_txt:
                    analyses.append({
                        "filename": doc_data.get("filename", f"Document {doc_id}"),
                        "document_type": doc_data.get("document_type", "general"),
                        "analysis_text": analysis_txt,
                    })

        logger.info(f"Fetched {len(analyses)} document analyses for user {user_id}")
        return analyses

    except Exception as e:
        logger.error(f"Failed to fetch document analyses: {e}")
        return []


@app.get("/")
async def serve_test_ui():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.websocket("/chat/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session_id = session_manager.create_session()

    # Extract user_id and document_ids from query params
    user_id = websocket.query_params.get("user_id", "")
    doc_ids_param = websocket.query_params.get("document_ids", "")
    document_ids = [d.strip() for d in doc_ids_param.split(",") if d.strip()] if doc_ids_param else None

    logger.info(f"WebSocket connected. Session: {session_id}, User: {user_id}, Docs: {document_ids}")

    # Fetch document analyses once at connection time
    document_analyses = []
    if user_id:
        document_analyses = await _fetch_document_analyses(user_id, document_ids)
        logger.info(f"Loaded {len(document_analyses)} analyses for voice session")

    try:
        while True:
            # Receive text payload (which contains JSON)
            data_str = await websocket.receive_text()
            
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON format."})
                continue
            
            user_input_type = data.get("type")
            user_content = data.get("content")

            # Allow dynamic document_ids update per message
            msg_doc_ids = data.get("document_ids")
            if msg_doc_ids and user_id:
                document_analyses = await _fetch_document_analyses(user_id, msg_doc_ids)

            if user_input_type not in ["text", "audio"] or not user_content:
                await websocket.send_json({"error": "Payload must include 'type' (text/audio) and 'content'."})
                continue

            logger.info(f"Received {user_input_type} message in session {session_id}")

            current_history = session_manager.get_history(session_id)

            # Process with Gemini agent — pass document analyses for context
            audio_mime_in = data.get("mime_type", "audio/webm")
            text_resp, audio_b64, audio_mime, updated_history = await process_chat(
                current_history, 
                user_input_type, 
                user_content,
                document_analyses=document_analyses,
                audio_mime_type=audio_mime_in,
            )

            session_manager.update_history(session_id, updated_history)

            response_payload = {
                "text": text_resp,
                "audio": audio_b64,
                "audio_mime": audio_mime
            }
            await websocket.send_json(response_payload)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
        session_manager.end_session(session_id)
    except Exception as e:
        logger.error(f"Error in websocket loop: {e}")
        session_manager.end_session(session_id)
