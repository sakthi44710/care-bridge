# CareBridge Voice Microservice

## CareBridge — Project Overview
CareBridge is a cross-platform AI-powered healthcare document intelligence platform that bridges the gap between patients and doctors through document intelligence, real-time consultations, and AI-assisted health understanding. It is built on a unified FastAPI backend (port 8000) serving both a Next.js web app and a Flutter mobile app.

### Platform USPs & Completed Features
1. **Patient-controlled data sovereignty** — patients explicitly grant/revoke access with Blockchain/Crypto Audit trails.
2. **OCR + AI chain** — automated document processing (GLM-OCR) to medical reasoning (MediX-R1-8B).
3. **FHIR compliance** — interoperable with real healthcare systems and longitudinal trends.
4. **Multi-role platform** — Auth & workflows for Patients, Doctors, Clinicians, and Admins.
5. **Cross-platform from day one** — Next.js web + Flutter mobile with shared Firebase backend.
6. **Native colloquial language duplex voice agent** — *This is the final pending piece, fulfilled by this microservice!*

---

## What This Microservice Does
A standalone voice + text chat microservice for the CareBridge platform, fulfilling the **Native Language Duplex Voice Agent** requirement.  
It replaces existing text-only chat by accepting **text or audio** via WebSocket, processing it through Gemini, and returning **both text + audio** simultaneously.

## Tech Stack
- **Python + FastAPI** — WebSocket server on port 8001
- **google-genai** — Google's GenAI SDK for Gemini models
- **Models** (two-step approach with Dual API Keys):
  - `gemini-3-flash-preview` — text response generation (with system prompt + session history)
  - `gemini-2.5-flash-preview-tts` — converts text to spoken audio (TTS)
- **Audio Processing** — Automatic `_pcm_to_wav` conversion wrapping raw Gemini PCM output with WAV headers for native browser playback
- **Resilience** — Automatic retries (up to 3x with exponential backoff) for Gemini API rate limits (`503 UNAVAILABLE`)
- **WebSocket** at `/chat/stream` — single endpoint for text & audio
- **In-memory sessions** — no database, history per WebSocket connection

## Architecture
```
Client (Flutter/Next.js)
    ↓ WebSocket JSON {type, content}
main.py (FastAPI + /chat/stream)
    ↓
session_manager.py (in-memory history per session)
    ↓
agent.py
    ├── Step 1: gemini-3-flash-preview → TEXT response (with full system prompt)
    └── Step 2: gemini-2.5-flash-preview-tts → AUDIO (TTS of the text)
    ↓ returns {text, audio}
Client receives both simultaneously
```

> **Why two models?** `gemini-3-flash-preview` does NOT support simultaneous `[TEXT, AUDIO]` 
> response modalities. So we get the text first, then use a dedicated TTS model for audio.

## Key Files
| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, CORS, WebSocket endpoint, serves static UI |
| `agent.py` | Two-step Gemini integration (text + TTS), dual client logic, retry mechanism, PCM-to-WAV conversion |
| `session_manager.py` | In-memory session/history tracking |
| `static/index.html` | Beautiful live web UI for testing voice and text chat |
| `.env` | Stores `GOOGLE_API_KEY` (Text) and `GOOGLE_TTS_API_KEY` (Audio) |

## WebSocket Message Format
**Client sends:**
```json
{"type": "text", "content": "en sugar normal-aa?"}
{"type": "audio", "content": "<base64 audio bytes>"}
```
**Server responds:**
```json
{
  "text": "response here", 
  "audio": "<base64 audio bytes>",
  "audio_mime": "audio/wav"
}
```

## System Prompt Style
- All responses use **romanized English spellings** — no Tamil/Hindi/Telugu script characters
- Tanglish example: "unga sugar level normal-aa irukku" (not "உங்க sugar level...")
- Also handles Hinglish, Telugu, and plain English — all in English spellings
- Always ends with a disclaimer in the patient's language
- Max 2-3 sentences, simple non-medical words

## How to Run & Test
```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

Once running, open **http://localhost:8001** in your browser to access the live Voice Chat Test UI. You can type messages or record voice, and hear the AI speak back.

## Important Constraints
- Port **8001** (CareBridge main backend is on 8000)
- No auth inside this service — CareBridge backend handles auth
- No database — pure in-memory sessions
- All audio as **base64 strings inside JSON** — no binary WebSocket frames
- CORS allows `*` (localhost:3000 for Next.js + Flutter)

---

## Integration Plan into CareBridge Monorepo

To fully achieve the pending "Native Language Duplex Voice Agent" USP, this service seamlessly integrates with the existing CareBridge frontend applications:

### 1. Web Frontend (Next.js) Integration
- Create a new `web/components/VoiceChat.tsx` connecting to `ws://localhost:8001/chat/stream`.
- Implement `MediaRecorder` for microphone capture and send base64-encoded `{"type": "audio", "content": "..."}`.
- Replicate the `_pcm_to_wav` audio playback logic (using `audio_mime` and `new Audio()`).
- Replace or enhance the text assistant in `web/pages/dashboard.tsx` with this duplex agent.

### 2. Mobile Frontend (Flutter) Integration
- Create a `mobile/lib/screens/voice_chat_screen.dart` holding a modern chat interface.
- Use `web_socket_channel` to interact with port 8001.
- Use audio capture packages (like `record` or `flutter_sound`) to record patient questions natively.
- Decode incoming base64 payload and stream playback natively via `audioplayers` or `just_audio`.
- Navigate to this unified real-time screen from the main patient dashboard.

### 3. Separation of Concerns
This microservice runs standalone on **port 8001uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload 2>&1** to completely isolate real-time WebSocket traffic and voice latency from the primary FastAPI backend (port 8000), protecting main application performance.
