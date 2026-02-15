"""OCR Service using NVIDIA Vision AI for precise document text extraction."""
import io
import base64
import logging
import time
from typing import Optional
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
    method: str = "ai_vision"


# Vision AI prompt for precise medical document OCR
VISION_OCR_PROMPT = """Extract ALL text from this medical document image exactly as written.
Preserve the original structure, formatting, and layout as much as possible.
Include:
- Headers, titles, and subtitles
- Patient information fields
- All test names, values, units, and reference ranges
- Dates, doctor names, clinic/hospital names
- Notes, comments, and footnotes
- Any stamps, signatures descriptions

Output ONLY the extracted text. Do not add commentary, interpretation, or summaries.
If a section is hard to read, include your best attempt with [unclear] next to it."""


class OCRService:
    """
    Document text extraction using NVIDIA Vision AI.

    Uses microsoft/phi-3.5-vision-instruct (or configured vision model)
    to extract text from document images with high accuracy.

    Supports:
    - Image files (PNG, JPEG, TIFF, BMP, WEBP)
    - PDF files (native text extraction + AI vision fallback for scanned pages)
    """

    SUPPORTED_IMAGES = {
        "image/png", "image/jpeg", "image/tiff",
        "image/bmp", "image/webp",
    }
    SUPPORTED_PDF = {"application/pdf"}

    # Max image dimension to keep API payload manageable
    MAX_IMAGE_DIM = 2048

    def __init__(self):
        """Initialize OCR service."""
        self._available = bool(settings.NVIDIA_API_KEY)
        if self._available:
            logger.info(
                f"AI Vision OCR initialized with model: "
                f"{settings.NVIDIA_VISION_MODEL}"
            )
        else:
            logger.warning("NVIDIA API key not configured — AI OCR disabled")

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
                return await self._extract_from_image(file_data)
            elif mime_type in self.SUPPORTED_PDF:
                return await self._extract_from_pdf(file_data)
            else:
                logger.warning(f"Unsupported MIME type for OCR: {mime_type}")
                return OCRResult(text="", confidence=0.0, method="unsupported")
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            return OCRResult(text="", confidence=0.0, method="error")

    # ── Image OCR via Vision AI ──────────────────────────────

    async def _extract_from_image(self, file_data: bytes) -> OCRResult:
        """Extract text from an image using NVIDIA Vision AI."""
        if not self._available:
            logger.warning("AI OCR unavailable — NVIDIA API key missing")
            return OCRResult(text="", confidence=0.0, method="unavailable")

        start = time.time()

        try:
            # Prepare image: resize if too large, convert to PNG base64
            image = Image.open(io.BytesIO(file_data))
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGB")

            # Resize large images to keep payload reasonable
            image = self._resize_if_needed(image)
            b64_image = self._image_to_base64(image)

            # Call vision model
            text = await self._call_vision_api(b64_image)

            elapsed_ms = int((time.time() - start) * 1000)
            word_count = len(text.split()) if text else 0
            confidence = min(0.95, 0.6 + (word_count / 500) * 0.35) if word_count > 0 else 0.0

            logger.info(
                f"AI Vision OCR completed: {word_count} words, "
                f"confidence={confidence:.0%}, latency={elapsed_ms}ms"
            )

            return OCRResult(
                text=text.strip(),
                confidence=round(confidence, 2),
                method="ai_vision",
            )

        except Exception as e:
            logger.error(f"AI Vision OCR failed: {e}")
            return OCRResult(text="", confidence=0.0, method="error")

    # ── PDF OCR ──────────────────────────────────────────────

    async def _extract_from_pdf(self, file_data: bytes) -> OCRResult:
        """
        Extract text from PDF.
        1. Try native text extraction (fast, high confidence).
        2. For scanned/image PDFs, render pages to images and use Vision AI.
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

            # Step 2: Scanned PDF → render pages to images → Vision AI OCR
            if not self._available:
                logger.warning("Scanned PDF but AI OCR unavailable")
                return OCRResult(
                    text="", confidence=0.0,
                    page_count=page_count, method="pdf_no_text",
                )

            return await self._ocr_pdf_pages(file_data, page_count)

        except Exception as e:
            logger.error(f"PDF processing failed: {e}")
            return OCRResult(text="", confidence=0.0, method="error")

    async def _ocr_pdf_pages(
        self, file_data: bytes, page_count: int
    ) -> OCRResult:
        """Render scanned PDF pages and run Vision AI OCR on each."""
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
        # Limit to first 10 pages to avoid excessive API calls
        max_pages = min(len(doc), 10)

        for i in range(max_pages):
            page = doc[i]
            # Render at 200 DPI for good quality
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")

            image = Image.open(io.BytesIO(img_bytes))
            image = self._resize_if_needed(image)
            b64_image = self._image_to_base64(image)

            try:
                page_text = await self._call_vision_api(b64_image)
                if page_text and page_text.strip():
                    text_parts.append(f"--- Page {i + 1} ---\n{page_text.strip()}")
            except Exception as e:
                logger.warning(f"Vision OCR failed for PDF page {i + 1}: {e}")
                text_parts.append(f"--- Page {i + 1} ---\n[OCR failed for this page]")

        doc.close()

        full_text = "\n\n".join(text_parts)
        elapsed_ms = int((time.time() - start) * 1000)
        word_count = len(full_text.split()) if full_text else 0
        confidence = min(0.93, 0.6 + (word_count / 500) * 0.33) if word_count > 0 else 0.0

        logger.info(
            f"PDF AI Vision OCR: {max_pages} pages, {word_count} words, "
            f"confidence={confidence:.0%}, latency={elapsed_ms}ms"
        )

        return OCRResult(
            text=full_text.strip(),
            confidence=round(confidence, 2),
            page_count=page_count,
            method="ai_vision_pdf",
        )

    # ── NVIDIA Vision API call ───────────────────────────────

    async def _call_vision_api(self, b64_image: str) -> str:
        """
        Call NVIDIA Vision API to extract text from a base64 image.

        Returns extracted text string.
        """
        model = settings.NVIDIA_VISION_MODEL
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": VISION_OCR_PROMPT,
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{b64_image}",
                            },
                        },
                    ],
                }
            ],
            "max_tokens": 4096,
            "temperature": 0.1,  # Low temp for accurate extraction
            "top_p": 0.9,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{settings.NVIDIA_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.NVIDIA_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            text = data["choices"][0]["message"]["content"]
            tokens = data.get("usage", {}).get("total_tokens", 0)

            logger.debug(
                f"Vision API response: {len(text)} chars, {tokens} tokens"
            )
            return text

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

    def _image_to_base64(self, image: Image.Image) -> str:
        """Convert PIL Image to base64-encoded PNG string."""
        buf = io.BytesIO()
        if image.mode == "RGBA":
            image = image.convert("RGB")
        image.save(buf, format="PNG", optimize=True)
        buf.seek(0)
        return base64.b64encode(buf.read()).decode("utf-8")


# Global service instance
ocr_service = OCRService()
