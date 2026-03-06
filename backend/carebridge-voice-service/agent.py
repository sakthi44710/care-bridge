import os
import base64
import logging
import asyncio
import struct
from pathlib import Path
from typing import List, Tuple, Optional
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load .env from the backend root (parent of this file's directory),
# so we use the main project API keys instead of stale local ones.
_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")

# Two separate API keys to avoid rate limits
# GOOGLE_API_KEY → text generation (Gemini 3 Flash)
# GOOGLE_TTS_API_KEY → TTS audio (Gemini 2.5 Flash TTS)
text_api_key = os.getenv("GOOGLE_API_KEY")
tts_api_key = os.getenv("GOOGLE_TTS_API_KEY", text_api_key)  # fallback to main key

text_client = genai.Client(api_key=text_api_key)
tts_client = genai.Client(api_key=tts_api_key)

MODEL_ID = "gemini-3-flash-preview"

logger = logging.getLogger("uvicorn.error")

BASE_SYSTEM_PROMPT = """You are CareBridge, a friendly medical assistant helping patients understand their lab reports.

LANGUAGES YOU MUST HANDLE:
- Tanglish: Tamil + English mixed in English spellings ("en sugar level correct-aa irukka?")
- Tamil spoken style in English spellings ("unga raththathula enna prachana")
- Hinglish: Hindi + English mixed ("mera BP high kyu hai")
- Hindi colloquial ("sugar kitna hona chahiye")
- Telugu colloquial in English spellings ("naa report lo em problem undi")
- English simple non-medical

TANGLISH EXAMPLES YOU MUST UNDERSTAND:
- "en sugar normal-aa?" -> Is my blood sugar normal?
- "report-la enna problem?" -> What problem is in report?
- "BP high-aa irukku, serious-aa?" -> BP is high, is it serious?
- "hemoglobin low-aa irukku doctor solluchu" -> Doctor said hemoglobin is low
- "thyroid check panna solluchu" -> Asked to check thyroid
- "kidney function okay-vaa?" -> Is kidney function okay?
- "adhu prachanaya?" -> Is that a problem?
- "sugar level yevalavu irukkanum?" -> How much should sugar level be?

RULES:
- Reply in the SAME language/mix the patient used
- If they speak Tanglish, reply in Tanglish using ENGLISH SPELLINGS only (no Tamil script)
- If they speak Hinglish, reply in Hinglish using ENGLISH SPELLINGS only (no Hindi script)
- If they speak Telugu style, reply using ENGLISH SPELLINGS only (no Telugu script)
- NEVER use Tamil/Hindi/Telugu script characters — always use romanized English spellings
- Never use formal medical terms without explaining in simple words
- Keep responses to 2-3 sentences max
- ONLY in your VERY FIRST reply of a conversation, end with the disclaimer below. Do NOT repeat it in subsequent replies.

DISCLAIMER (first reply only):
- Tanglish/Tamil: "Idhu doctor advice illa, unga doctor kitta confirm pannunga"
- Hinglish/Hindi: "Yeh doctor ki advice nahi hai, apne doctor se milein"
- Telugu: "Idi doctor advice kaadu, mee doctor ni kalavaandi"
- English: "This is not medical advice. Please consult your doctor."
"""


def build_system_prompt(document_analyses: Optional[List[dict]] = None) -> str:
    """Build system prompt with optional document analysis context from Firebase."""
    prompt = BASE_SYSTEM_PROMPT

    if document_analyses:
        prompt += "\n\n--- PATIENT'S MEDICAL DOCUMENT ANALYSES ---\n"
        prompt += "The following are AI-generated analyses of the patient's uploaded medical documents. "
        prompt += "Use this information to answer their questions accurately.\n\n"

        for i, doc in enumerate(document_analyses, 1):
            filename = doc.get("filename", f"Document {i}")
            analysis_text = doc.get("analysis_text", "")
            doc_type = doc.get("document_type", "general")
            if analysis_text:
                prompt += f"### Document {i}: {filename} (Type: {doc_type})\n"
                prompt += f"{analysis_text}\n\n"

        prompt += "--- END OF DOCUMENT ANALYSES ---\n"
        prompt += "\nUse the above analyses to answer the patient's questions. "
        prompt += "If they ask about something not in the documents, say so politely.\n"

    return prompt

# TTS model that supports audio output
TTS_MODEL_ID = "gemini-2.5-flash-preview-tts"


def _pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """Wrap raw PCM bytes in a WAV header so browsers can play it."""
    data_size = len(pcm_data)
    byte_rate = sample_rate * channels * (bits_per_sample // 8)
    block_align = channels * (bits_per_sample // 8)
    
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        36 + data_size,       # file size - 8
        b'WAVE',
        b'fmt ',
        16,                   # chunk size
        1,                    # PCM format
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b'data',
        data_size
    )
    return header + pcm_data


MAX_RETRIES = 3
RETRY_DELAYS = [2, 4]  # seconds between retries


async def _call_with_retry(label: str, func, *args, **kwargs):
    """Retry a sync Gemini API call up to MAX_RETRIES times with exponential backoff."""
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                delay = RETRY_DELAYS[attempt] if attempt < len(RETRY_DELAYS) else 4
                logger.warning(f"[{label}] Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
                await asyncio.sleep(delay)
            else:
                logger.error(f"[{label}] All {MAX_RETRIES} attempts failed: {e}")
    raise last_error


async def process_chat(
    session_history: List,
    user_input_type: str,
    user_content: str,
    document_analyses: Optional[List[dict]] = None,
    audio_mime_type: str = "audio/webm",
) -> Tuple[str, str, str, List]:
    """
    Processes chat input (text or base64 audio), updates the session history,
    and returns (text_response, base64_audio_response, audio_mime, updated_history).
    
    Strategy:
    1. Send user input to gemini-3-flash-preview for TEXT response (with system prompt + doc analyses)
    2. Use gemini-2.5-flash-preview-tts to convert the text response into audio
    Both steps retry up to 3 times on transient failures.
    """
    # Build system prompt with document analyses context
    system_prompt = build_system_prompt(document_analyses)

    # Build the user message part
    if user_input_type == "audio":
        audio_bytes = base64.b64decode(user_content)
        user_message_part = types.Part.from_bytes(
            data=audio_bytes,
            mime_type=audio_mime_type,
        )
    else:
        user_message_part = types.Part.from_text(text=user_content)

    new_user_message = types.Content(role="user", parts=[user_message_part])

    current_history = session_history.copy()
    current_history.append(new_user_message)

    # --- Step 1: Get TEXT response from Gemini 3.0 Flash (with retry) ---
    text_config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        response_modalities=["TEXT"],
    )

    text_resp = ""
    audio_b64 = ""
    audio_mime = ""

    try:
        response = await _call_with_retry(
            "TextGen",
            text_client.models.generate_content,
            model=MODEL_ID,
            contents=current_history,
            config=text_config
        )

        model_parts = []
        if response.candidates and response.candidates[0].content:
            model_parts = response.candidates[0].content.parts

        for part in model_parts:
            if part.text:
                text_resp += part.text

        text_resp = text_resp.strip()

        # Add model reply to history for context
        if model_parts:
            model_reply = types.Content(role="model", parts=model_parts)
            current_history.append(model_reply)

    except Exception as e:
        logger.error(f"Error getting text from Gemini after retries: {e}")
        return "Sorry, I am having trouble processing your request right now.", "", "", session_history

    # --- Step 2: Convert text response to audio using TTS model (with retry) ---
    if text_resp:
        try:
            tts_config = types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Aoede"
                        )
                    )
                )
            )

            tts_response = await _call_with_retry(
                "TTS",
                tts_client.models.generate_content,
                model=TTS_MODEL_ID,
                contents=f"Read this aloud naturally: {text_resp}",
                config=tts_config
            )

            if tts_response.candidates and tts_response.candidates[0].content:
                for part in tts_response.candidates[0].content.parts:
                    if part.inline_data:
                        raw_audio = part.inline_data.data
                        mime = part.inline_data.mime_type or "audio/L16"
                        logger.info(f"TTS returned audio: mime={mime}, size={len(raw_audio)} bytes")
                        
                        # Gemini TTS returns raw PCM (linear16, 24kHz) — wrap in WAV header
                        if "L16" in mime or "pcm" in mime.lower() or "raw" in mime.lower():
                            wav_audio = _pcm_to_wav(raw_audio)
                            audio_b64 = base64.b64encode(wav_audio).decode('utf-8')
                            audio_mime = "audio/wav"
                        else:
                            # Already encoded (mp3/wav/etc)
                            audio_b64 = base64.b64encode(raw_audio).decode('utf-8')
                            audio_mime = mime
                        break

        except Exception as e:
            logger.warning(f"TTS audio generation failed after retries (text will still be returned): {e}")

    if not text_resp:
        text_resp = "[Could not generate response]"

    return text_resp, audio_b64, audio_mime, current_history
