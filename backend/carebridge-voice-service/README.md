# CareBridge Voice Microservice

A unified voice + text chat microservice built for CareBridge, leveraging FastAPI, WebSockets, and Google's Gemini 3.0 Flash. It accepts text or base64 recorded audio, invokes the GenAI model, and simultaneously returns a text response and a spoken audio response. It manages in-memory sessions per websocket connection.

## Setup & Run

1. **Install requirements:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Environment Variables:**
   Make sure you have a `.env` file in the root with:
   ```env
   GOOGLE_API_KEY=...
   ```

3. **Run the Server:**
   This microservice must be run on port 8001 (CareBridge main backend runs on 8000).
   ```bash
   uvicorn main:app --reload --port 8001
   ```

## Client Integration Examples

### Flutter Integration Snippet

Using `web_socket_channel`, `record`, and `audioplayers`:

```dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'dart:io';

class VoiceChatService {
  late WebSocketChannel _channel;
  final AudioRecorder _audioRecorder = AudioRecorder();
  final AudioPlayer _audioPlayer = AudioPlayer();
  
  Function(String text)? onMessageReceived;

  void connect() {
    _channel = WebSocketChannel.connect(
      Uri.parse('ws://localhost:8001/chat/stream'),
    );

    _channel.stream.listen((message) async {
      final data = jsonDecode(message);
      
      // Handle text
      if (data['text'] != null && onMessageReceived != null) {
        onMessageReceived!(data['text']);
      }
      
      // Handle audio simultaneously
      if (data['audio'] != null && data['audio'].isNotEmpty) {
        // Decode base64 to bytes and play
        final audioBytes = base64Decode(data['audio']);
        await _audioPlayer.play(BytesSource(audioBytes));
      }
    });
  }

  Future<void> sendText(String text) async {
    final payload = jsonEncode({"type": "text", "content": text});
    _channel.sink.add(payload);
  }

  Future<void> startRecording() async {
    if (await _audioRecorder.hasPermission()) {
      // Record to path or stream; here we record to a file for brevity
      final tempDir = Directory.systemTemp;
      final path = '${tempDir.path}/temp_audio.wav';
      await _audioRecorder.start(
        const RecordConfig(encoder: AudioEncoder.wav), 
        path: path
      );
    }
  }

  Future<void> stopRecordingAndSend() async {
    final path = await _audioRecorder.stop();
    if (path != null) {
      final file = File(path);
      final bytes = await file.readAsBytes();
      final base64Audio = base64Encode(bytes);
      
      final payload = jsonEncode({
        "type": "audio", 
        "content": base64Audio
      });
      _channel.sink.add(payload);
      
      // Clean up temp file
      file.delete();
    }
  }

  void dispose() {
    _channel.sink.close();
    _audioRecorder.dispose();
    _audioPlayer.dispose();
  }
}
```

### Next.js Integration Snippet

Using the native browser `WebSocket`, `MediaRecorder` for capturing audio, and HTML5 `Audio` for playback.

```javascript
'use client';
import { useEffect, useState, useRef } from 'react';

export default function VoiceChat() {
  const [messages, setMessages] = useState([]);
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    // Connect WebSocket
    wsRef.current = new WebSocket('ws://localhost:8001/chat/stream');
    
    wsRef.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      // Display text in UI
      if (data.text) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.text }]);
      }
      
      // Play audio simultaneously
      if (data.audio) {
        const audioSrc = `data:audio/wav;base64,${data.audio}`;
        const audio = new Audio(audioSrc);
        audio.play().catch(e => console.error("Audio playback error:", e));
      }
    };

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const sendText = (text) => {
    setMessages(prev => [...prev, { role: 'user', text }]);
    wsRef.current.send(JSON.stringify({ type: 'text', content: text }));
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorderRef.current = new MediaRecorder(stream);
    audioChunksRef.current = [];

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };

    mediaRecorderRef.current.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
      const reader = new FileReader();
      
      reader.onloadend = () => {
        // Remove the data URL prefix
        const base64Audio = reader.result.split(',')[1];
        setMessages(prev => [...prev, { role: 'user', text: '[Voice Message]' }]);
        wsRef.current.send(JSON.stringify({ type: 'audio', content: base64Audio }));
      };
      
      reader.readAsDataURL(audioBlob);
    };

    mediaRecorderRef.current.start();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div>
      <div className="chat-box">
        {messages.map((m, i) => (
          <div key={i} className={m.role}>{m.text}</div>
        ))}
      </div>
      <button onMouseDown={startRecording} onMouseUp={stopRecording}>
        Hold to Speak
      </button>
    </div>
  );
}
```
