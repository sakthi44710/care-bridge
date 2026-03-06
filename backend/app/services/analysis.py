"""
Document Analysis Service — free-flowing top-to-bottom analysis.

After a document is uploaded the AI reads it from top to bottom and
generates a detailed medical analysis as plain text (markdown).
The analysis is cached in Firestore (`document_analyses/{doc_id}`) so
that the chat service can answer instantly without re-running the model.
"""
import logging
import base64
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import settings
from app.services.storage import download_from_storage

logger = logging.getLogger(__name__)

IMAGE_MIMES = {
    "image/png", "image/jpeg", "image/jpg",
    "image/webp", "image/gif", "image/bmp", "image/tiff",
}

# ── Prompts ───────────────────────────────────────────────────────────

SCAN_ANALYSIS_PROMPT = (
    "You are a medical imaging specialist AI. Analyze this medical scan "
    "image thoroughly from top to bottom.\n\n"
    "Look at the image carefully and write a complete, detailed medical "
    "analysis. Go through everything you observe systematically — start "
    "from the top of the image and work your way down. Do not skip "
    "anything.\n\n"
    "Write your analysis as a flowing medical report. Cover these "
    "aspects naturally as you go:\n\n"
    "1. What type of scan this is and what body part is shown\n"
    "2. Every structure you can identify — describe what you see\n"
    "3. Any normal findings — confirm what looks healthy\n"
    "4. Any abnormal findings — describe exactly what is wrong, "
    "where it is, and how it looks\n"
    "5. Compare left vs right if applicable\n"
    "6. Note any artifacts or image quality issues\n"
    "7. After describing everything, give your overall assessment\n"
    "8. List the most likely conditions/diseases based on your "
    "findings\n"
    "9. Suggest what additional tests or imaging might help\n"
    "10. Write a simple explanation a patient would understand\n\n"
    "Write naturally like a radiologist dictating a report. "
    "Use **bold** for important findings and headings. "
    "Do not use JSON format. Do not add any disclaimer."
)

TEXT_ANALYSIS_PROMPT = (
    "You are a medical document analysis specialist AI. Analyze this "
    "medical document thoroughly from top to bottom.\n\n"
    "Document content:\n{content}\n\n"
    "Read through the entire document carefully from start to finish. "
    "Write a complete, detailed analysis covering everything in the "
    "document. Go through it systematically — start from the top and "
    "work your way to the bottom. Do not skip any section.\n\n"
    "Write your analysis as a flowing medical report. Cover these "
    "aspects naturally as you go:\n\n"
    "1. What type of document this is (lab report, prescription, "
    "discharge summary, etc.)\n"
    "2. Any patient information visible\n"
    "3. Every single test result, measurement, or finding — include "
    "the value, reference range, and whether it is normal or abnormal\n"
    "4. Any medications mentioned with dosages and frequency\n"
    "5. Any diagnoses or clinical impressions\n"
    "6. After going through everything, give your overall assessment\n"
    "7. Highlight which results are concerning and why\n"
    "8. List the most likely conditions/diseases based on the findings\n"
    "9. Suggest what follow-up tests or actions might be needed\n"
    "10. Write a simple explanation a patient would understand\n\n"
    "Write naturally like a doctor reviewing results. "
    "Use **bold** for important findings, abnormal values, and "
    "headings. Do not use JSON format. Do not add any disclaimer."
)


# ── Service ───────────────────────────────────────────────────────────

class AnalysisService:
    """Generates and caches free-flowing document analyses."""

    # ── public API ────────────────────────────────────────────────────

    async def analyze_document(
        self,
        doc_id: str,
        user_id: str,
        doc_data: dict,
        db,
    ) -> Optional[str]:
        """
        Analyze a document and store the result in Firestore.

        Returns the analysis text or ``None`` on failure.
        """
        try:
            logger.info(f"Starting analysis for document {doc_id}")

            mime_type = doc_data.get("mime_type", "")
            is_image = mime_type in IMAGE_MIMES
            storage_path = doc_data.get("storage_path", "")
            ocr_text = doc_data.get("ocr_text", "")
            filename = doc_data.get("filename", "")

            analysis_text: Optional[str] = None

            if is_image:
                analysis_text = await self._analyze_scan(
                    doc_id, storage_path, filename,
                )
            else:
                if not ocr_text:
                    logger.warning(
                        f"No OCR text for document {doc_id}, skipping analysis"
                    )
                    return None
                analysis_text = await self._analyze_text(doc_id, ocr_text)

            if not analysis_text:
                return None

            # Persist to Firestore
            analysis_doc = {
                "document_id": doc_id,
                "user_id": user_id,
                "filename": filename,
                "mime_type": mime_type,
                "is_scan": is_image,
                "analysis": analysis_text,
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
                "model_used": settings.LOCAL_MODEL_PATH or settings.HF_MODEL,
                "status": "completed",
            }

            db.collection("document_analyses").document(doc_id).set(
                analysis_doc
            )
            logger.info(
                f"Analysis saved for document {doc_id} "
                f"({len(analysis_text)} chars)"
            )

            # Mark the document itself
            db.collection("documents").document(doc_id).update({
                "analysis_status": "completed",
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
            })

            return analysis_text

        except Exception as e:
            logger.error(f"Analysis failed for document {doc_id}: {e}")
            try:
                db.collection("document_analyses").document(doc_id).set({
                    "document_id": doc_id,
                    "user_id": user_id,
                    "status": "failed",
                    "error": str(e),
                    "analyzed_at": datetime.now(timezone.utc).isoformat(),
                })
                db.collection("documents").document(doc_id).update({
                    "analysis_status": "failed",
                })
            except Exception:
                pass
            return None

    async def get_analysis(self, doc_id: str, db) -> Optional[str]:
        """Retrieve a cached analysis from Firestore."""
        try:
            doc = db.collection("document_analyses").document(doc_id).get()
            if doc.exists:
                data = doc.to_dict()
                if data.get("status") == "completed":
                    return data.get("analysis")
            return None
        except Exception as e:
            logger.error(f"Error retrieving analysis for {doc_id}: {e}")
            return None

    # ── private helpers ───────────────────────────────────────────────

    async def _analyze_scan(
        self,
        doc_id: str,
        storage_path: str,
        filename: str,
    ) -> Optional[str]:
        """Analyze a medical scan image via the vision model."""
        try:
            image_bytes = download_from_storage(storage_path)
            if not image_bytes:
                logger.error(
                    f"Could not download scan image for {doc_id}"
                )
                return None

            b64_image = base64.b64encode(image_bytes).decode("utf-8")

            ext = (
                filename.rsplit(".", 1)[-1].lower()
                if "." in filename
                else "jpg"
            )
            mime_map = {
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "webp": "image/webp",
                "gif": "image/gif",
                "bmp": "image/bmp",
            }
            mime = mime_map.get(ext, "image/jpeg")

            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime};base64,{b64_image}",
                            },
                        },
                        {"type": "text", "text": SCAN_ANALYSIS_PROMPT},
                    ],
                }
            ]

            return await self._call_ai(messages)

        except Exception as e:
            logger.error(f"Scan analysis failed for {doc_id}: {e}")
            return None

    async def _analyze_text(
        self, doc_id: str, ocr_text: str
    ) -> Optional[str]:
        """Analyze a text-based medical document."""
        try:
            text = ocr_text[:10000]
            prompt = TEXT_ANALYSIS_PROMPT.format(content=text)
            messages = [{"role": "user", "content": prompt}]
            return await self._call_ai(messages)
        except Exception as e:
            logger.error(f"Text analysis failed for {doc_id}: {e}")
            return None

    async def _call_ai(self, messages: list) -> Optional[str]:
        """Fire a request to the configured AI provider."""
        if settings.AI_PROVIDER == "local":
            return await self._call_local(messages)
        return await self._call_hf(messages)

    async def _call_local(self, messages: list) -> Optional[str]:
        url = f"{settings.LLAMA_SERVER_URL}/v1/chat/completions"
        payload = {
            "messages": messages,
            "max_tokens": 8000,
            "temperature": 0.3,
            "top_p": 0.9,
        }
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                logger.error(
                    f"llama-server error: {resp.status_code} "
                    f"{resp.text[:200]}"
                )
                return None
            data = resp.json()
            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            # Strip <think>…</think> reasoning tags
            if "<think>" in content and "</think>" in content:
                content = content.split("</think>")[-1].strip()
            return content or None

    async def _call_hf(self, messages: list) -> Optional[str]:
        url = f"{settings.HF_INFERENCE_URL}/v1/chat/completions"
        headers = {"Authorization": f"Bearer {settings.HF_API_KEY}"}
        payload = {
            "model": settings.HF_MODEL,
            "messages": messages,
            "max_tokens": 8000,
            "temperature": 0.3,
        }
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                logger.error(f"HF API error: {resp.status_code}")
                return None
            data = resp.json()
            return (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            ) or None


# Singleton
analysis_service = AnalysisService()
