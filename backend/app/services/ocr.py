"""
OCR Service using MediX-R1 (llama-server) for document text extraction.

All OCR is handled by the MediX vision model running on llama-server.
PDFs with native text use PyPDF2 extraction (no model needed).
Images and scanned PDFs are sent to MediX vision for OCR.
"""
import io
import base64
import logging
import time
from dataclasses import dataclass

import httpx
from PIL import Image
from PyPDF2 import PdfReader

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class OCRResult:
    """OCR extraction result."""
    text: str
    confidence: float
    page_count: int = 1
    method: str = "medix_vision"


# Prompt for MediX vision OCR — extract raw text only
VISION_OCR_PROMPT = (
    "Read this document image carefully from top to bottom. "
    "Extract ALL text content exactly as it appears, preserving the "
    "layout, tables, numbers, and formatting. Include every detail — "
    "headers, values, units, dates, names, and notes. "
    "Output only the extracted text, nothing else."
)


class OCRService:
    """
    Document text extraction using MediX-R1 via llama-server.

    - Image files → MediX vision OCR (llama-server /v1/chat/completions)
    - PDF files → PyPDF2 native text extraction; scanned pages → MediX vision
    """

    SUPPORTED_IMAGES = {
        "image/png", "image/jpeg", "image/tiff",
        "image/bmp", "image/webp",
    }
    SUPPORTED_PDF = {"application/pdf"}

    MAX_IMAGE_DIM = 2048

    def __init__(self):
        """Initialize OCR service (uses llama-server, no local model load)."""
        logger.info(
            f"MediX OCR service ready — using llama-server at "
            f"{settings.LLAMA_SERVER_URL}"
        )

    async def extract_text(
        self,
        file_data: bytes,
        mime_type: str,
    ) -> OCRResult:
        """
        Extract text from a document.

        Args:
            file_data: Raw file bytes
            mime_type: MIME type of the file

        Returns:
            OCRResult with extracted text and confidence
        """
        try:
            if mime_type in self.SUPPORTED_IMAGES:
                return await self._extract_from_image(file_data, mime_type)
            elif mime_type in self.SUPPORTED_PDF:
                return await self._extract_from_pdf(file_data)
            else:
                logger.warning(f"Unsupported MIME type for OCR: {mime_type}")
                return OCRResult(text="", confidence=0.0, method="unsupported")
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            return OCRResult(text="", confidence=0.0, method="error")

    # ── Image OCR via MediX vision (llama-server) ────────────

    async def _extract_from_image(
        self, file_data: bytes, mime_type: str = "image/jpeg"
    ) -> OCRResult:
        """Extract text from an image using MediX vision via llama-server."""
        start = time.time()

        try:
            image = Image.open(io.BytesIO(file_data))
            if image.mode != "RGB":
                image = image.convert("RGB")

            image = self._resize_if_needed(image)

            # Re-encode for llama-server
            buf = io.BytesIO()
            fmt = "PNG" if mime_type == "image/png" else "JPEG"
            image.save(buf, format=fmt)
            b64_image = base64.b64encode(buf.getvalue()).decode("utf-8")
            actual_mime = f"image/{fmt.lower()}"

            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{actual_mime};base64,{b64_image}",
                            },
                        },
                        {"type": "text", "text": VISION_OCR_PROMPT},
                    ],
                }
            ]

            url = f"{settings.LLAMA_SERVER_URL}/v1/chat/completions"
            payload = {
                "messages": messages,
                "max_tokens": 4096,
                "temperature": 0.1,
            }

            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    logger.error(
                        f"MediX OCR error: {resp.status_code} "
                        f"{resp.text[:200]}"
                    )
                    return OCRResult(
                        text="", confidence=0.0, method="error"
                    )

                data = resp.json()
                text = (
                    data.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )

            # Strip <think>…</think> reasoning tags
            if "<think>" in text and "</think>" in text:
                text = text.split("</think>")[-1].strip()

            elapsed_ms = int((time.time() - start) * 1000)
            word_count = len(text.split()) if text else 0
            confidence = (
                min(0.95, 0.6 + (word_count / 500) * 0.35)
                if word_count > 0
                else 0.0
            )

            logger.info(
                f"MediX OCR completed: {word_count} words, "
                f"confidence={confidence:.0%}, latency={elapsed_ms}ms"
            )

            return OCRResult(
                text=text.strip(),
                confidence=round(confidence, 2),
                method="medix_vision",
            )

        except Exception as e:
            logger.error(f"MediX OCR inference failed: {e}")
            return OCRResult(text="", confidence=0.0, method="error")

    # ── PDF OCR ──────────────────────────────────────────────

    async def _extract_from_pdf(self, file_data: bytes) -> OCRResult:
        """
        Extract text from PDF.
        1. Try native text extraction via PyPDF2 (fast, no model needed).
        2. For scanned/image PDFs, render pages and use MediX vision OCR.
        """
        try:
            reader = PdfReader(io.BytesIO(file_data))
            page_count = len(reader.pages)

            # Step 1: Try native text extraction
            text_parts = []
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text and page_text.strip():
                    text_parts.append(page_text)

            if text_parts:
                full_text = "\n\n".join(text_parts)
                logger.info(
                    f"PDF native text: {len(full_text)} chars "
                    f"from {page_count} pages"
                )
                return OCRResult(
                    text=full_text.strip(),
                    confidence=0.95,
                    page_count=page_count,
                    method="pdf_text_extraction",
                )

            # Step 2: Scanned PDF → render pages → MediX vision OCR
            return await self._ocr_pdf_pages(file_data, page_count)

        except Exception as e:
            logger.error(f"PDF processing failed: {e}")
            return OCRResult(text="", confidence=0.0, method="error")

    async def _ocr_pdf_pages(
        self, file_data: bytes, page_count: int
    ) -> OCRResult:
        """Render scanned PDF pages and run MediX vision OCR on each."""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            logger.warning(
                "PyMuPDF (fitz) not installed — cannot OCR scanned PDFs. "
                "Install with: pip install PyMuPDF"
            )
            return OCRResult(
                text="", confidence=0.0,
                page_count=page_count, method="pdf_no_renderer",
            )

        start = time.time()
        doc = fitz.open(stream=file_data, filetype="pdf")

        text_parts = []
        max_pages = min(len(doc), 10)

        for i in range(max_pages):
            page = doc[i]
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")

            try:
                result = await self._extract_from_image(
                    img_bytes, "image/png"
                )
                if result.text:
                    text_parts.append(
                        f"--- Page {i + 1} ---\n{result.text}"
                    )
            except Exception as e:
                logger.warning(
                    f"MediX OCR failed for PDF page {i + 1}: {e}"
                )
                text_parts.append(
                    f"--- Page {i + 1} ---\n[OCR failed for this page]"
                )

        doc.close()

        full_text = "\n\n".join(text_parts)
        elapsed_ms = int((time.time() - start) * 1000)
        word_count = len(full_text.split()) if full_text else 0
        confidence = (
            min(0.93, 0.6 + (word_count / 500) * 0.33)
            if word_count > 0
            else 0.0
        )

        logger.info(
            f"PDF MediX OCR: {max_pages} pages, {word_count} words, "
            f"confidence={confidence:.0%}, latency={elapsed_ms}ms"
        )

        return OCRResult(
            text=full_text.strip(),
            confidence=round(confidence, 2),
            page_count=page_count,
            method="medix_vision_pdf",
        )

    # ── Image utilities ──────────────────────────────────────

    def _resize_if_needed(self, image: Image.Image) -> Image.Image:
        """Resize image if either dimension exceeds MAX_IMAGE_DIM."""
        w, h = image.size
        if max(w, h) <= self.MAX_IMAGE_DIM:
            return image

        ratio = self.MAX_IMAGE_DIM / max(w, h)
        new_w = int(w * ratio)
        new_h = int(h * ratio)
        return image.resize((new_w, new_h), Image.LANCZOS)


# Global service instance
ocr_service = OCRService()
