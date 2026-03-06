'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useChatStore } from '@/lib/store';
import { chatApi, documentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import {
  MessageSquare, Plus, Send, ArrowLeft, Trash2, Loader2,
  Bot, User, Brain, FileText,
  CheckSquare, Square, CheckCheck, XSquare, Mic, MicOff, Phone,
  PhoneOff, Volume2, X, Play, Pause,
} from 'lucide-react';

// ─── Voice WebSocket Hook ────────────────────────────────────
function useVoiceWebSocket(userId: string, documentIds: string[]) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef<((data: any) => void) | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    // Close any lingering socket
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const docParam = documentIds.length > 0 ? `&document_ids=${documentIds.join(',')}` : '';
    const wsUrl = `ws://localhost:8000/api/v1/voice/chat/stream?user_id=${userId}${docParam}`;
    console.log('[Voice WS] Connecting:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Voice WS] Connected');
      setConnected(true);
    };
    ws.onclose = (e) => {
      console.log('[Voice WS] Closed:', e.code, e.reason);
      setConnected(false);
      wsRef.current = null;
    };
    ws.onerror = (e) => {
      console.error('[Voice WS] Error:', e);
      setConnected(false);
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (handlerRef.current) {
          handlerRef.current(data);
        }
      } catch (err) {
        console.error('[Voice WS] Failed to parse message:', err);
      }
    };
    wsRef.current = ws;
  }, [userId, documentIds]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('[Voice WS] Cannot send — not connected. readyState:', wsRef.current?.readyState);
    }
  }, []);

  const onMessage = useCallback((handler: (data: any) => void) => {
    handlerRef.current = handler;
  }, []);

  return { ws: wsRef, connected, connect, disconnect, send, onMessage };
}

// ─── Audio Playback Helper ────────────────────────────────────
function playBase64Audio(audioB64: string, mime: string = 'audio/wav'): HTMLAudioElement {
  const byteChars = atob(audioB64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: mime });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play().catch(console.error);
  audio.onended = () => URL.revokeObjectURL(url);
  return audio;
}

// ─── Play Button Component for AI messages ────────────────────
function AudioPlayButton({ audioB64, audioMime }: { audioB64: string; audioMime: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
      return;
    }
    const byteChars = atob(audioB64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArray], { type: audioMime || 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    audioRef.current = a;
    a.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
    a.onerror = () => { setPlaying(false); };
    a.play().catch(() => setPlaying(false));
    setPlaying(true);
  };

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition mt-1.5 px-2 py-0.5 rounded-full bg-primary/5 hover:bg-primary/10"
      title={playing ? 'Stop' : 'Play aloud'}
    >
      {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      {playing ? 'Stop' : 'Play'}
    </button>
  );
}

export default function ChatPage() {
  const { isAuthenticated, user } = useAuthStore();
  const router = useRouter();
  const {
    activeConversationId, setActiveConversation,
    conversations, setConversations,
    messages, setMessages, addMessage,
    isLoading, setLoading,
  } = useChatStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Document panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [userDocuments, setUserDocuments] = useState<any[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docsLoading, setDocsLoading] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<Record<string, string>>({});

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Voice call mode (inline — no overlay)
  const [callMode, setCallMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Track whether this conversation has been auto-named
  const autoNamedRef = useRef<Set<string>>(new Set());

  const userId = (user as any)?.uid || '';
  const docIdsArray = Array.from(selectedDocIds);
  const voice = useVoiceWebSocket(userId, docIdsArray);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadConversations();
    loadUserDocuments();
  }, [isAuthenticated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const loadConversations = async () => {
    try {
      const response = await chatApi.list();
      setConversations(response.data);
    } catch (err) {
      console.error('Failed to load conversations');
    }
  };

  const loadUserDocuments = async () => {
    setDocsLoading(true);
    try {
      const response = await documentsApi.list(1, 100);
      const docs = response.data?.documents || response.data || [];
      setUserDocuments(docs);
      for (const doc of docs) {
        try {
          const res = await documentsApi.getAnalysis(doc.id);
          setAnalysisStatus((prev) => ({ ...prev, [doc.id]: res.data.status }));
        } catch {}
      }
    } catch (err) {
      console.error('Failed to load documents');
    } finally {
      setDocsLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await chatApi.get(conversationId);
      setMessages(response.data.messages);
      setActiveConversation(conversationId);
    } catch (err) {
      console.error('Failed to load messages');
    }
  };

  const createConversation = async () => {
    try {
      const response = await chatApi.create('New Conversation');
      setConversations([response.data, ...conversations]);
      setActiveConversation(response.data.id);
      setMessages([]);
    } catch (err) {
      console.error('Failed to create conversation');
    }
  };

  // ─── Auto-name conversation after first AI reply ──────
  const autoNameConversation = async (aiReplyText: string) => {
    if (!activeConversationId) return;
    if (autoNamedRef.current.has(activeConversationId)) return;

    // Only auto-name if conversation still has default title
    const conv = conversations.find((c: any) => c.id === activeConversationId);
    if (!conv || (conv.title && conv.title !== 'New Conversation')) return;

    autoNamedRef.current.add(activeConversationId);

    // Generate a short title from the AI reply (first meaningful line, max 40 chars)
    let title = aiReplyText
      .replace(/[#*_>`~\-]/g, '')  // strip markdown
      .split('\n')
      .map((l: string) => l.trim())
      .find((l: string) => l.length > 3) || 'Health Chat';
    
    // Truncate to ~40 chars at word boundary
    if (title.length > 40) {
      title = title.substring(0, 40).replace(/\s\S*$/, '') + '...';
    }

    try {
      await chatApi.updateTitle(activeConversationId, title);
      setConversations(
        conversations.map((c: any) =>
          c.id === activeConversationId ? { ...c, title } : c
        )
      );
    } catch (err) {
      console.error('Failed to auto-name conversation:', err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeConversationId || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      created_at: new Date().toISOString(),
    };

    addMessage(userMessage);
    const sentText = input;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);

    try {
      const docIds = selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined;
      const response = await chatApi.sendMessage(activeConversationId, sentText, docIds);
      const aiMsg = response.data;
      addMessage(aiMsg);

      // Auto-name after first AI reply
      autoNameConversation(aiMsg.content);
    } catch (err) {
      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        created_at: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await chatApi.delete(id);
      setConversations(conversations.filter((c: any) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversation(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete conversation');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ─── Document selection ────────────────────────────────
  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedDocIds(new Set(userDocuments.map((d: any) => d.id)));
  const deselectAll = () => setSelectedDocIds(new Set());

  // ─── Voice Call Mode (inline) ──────────────────────────
  const setupVoiceHandler = useCallback(() => {
    voice.onMessage((data: any) => {
      setVoiceProcessing(false);
      if (data.error) {
        addMessage({
          id: Date.now().toString(),
          role: 'assistant',
          content: `⚠️ ${data.error}`,
          created_at: new Date().toISOString(),
        });
        return;
      }
      if (data.text) {
        const msg: any = {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.text,
          created_at: new Date().toISOString(),
        };
        // Store audio data on the message for the play button
        if (data.audio) {
          msg.audio_b64 = data.audio;
          msg.audio_mime = data.audio_mime || 'audio/wav';
        }
        addMessage(msg);

        // Auto-name conversation
        autoNameConversation(data.text);
      }
      // In call mode → auto-play audio live
      if (data.audio && callMode) {
        currentAudioRef.current = playBase64Audio(data.audio, data.audio_mime || 'audio/wav');
      }
    });
  }, [voice, callMode, addMessage]);

  const startCallMode = () => {
    setCallMode(true);
    voice.connect();
    setupVoiceHandler();
  };

  const endCallMode = () => {
    setCallMode(false);
    stopRecording();
    voice.disconnect();
    currentAudioRef.current?.pause();
    currentAudioRef.current = null;
  };

  // Keep the voice message handler ref up-to-date whenever callMode changes
  useEffect(() => {
    setupVoiceHandler();
  }, [callMode, voice.connected, setupVoiceHandler]);

  const startRecording = async () => {
    // If not in call mode, connect voice WS first
    if (!voice.connected) {
      voice.connect();
      setupVoiceHandler();
      // Give WS a moment to connect before recording
      await new Promise((r) => setTimeout(r, 800));
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        // Combine recorded chunks into a single Blob
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // Convert to base64 in chunks to avoid call-stack overflow
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          binary += String.fromCharCode(...slice);
        }
        const base64 = btoa(binary);

        if (!base64) {
          console.error('Recording produced empty audio');
          return;
        }

        addMessage({
          id: Date.now().toString(),
          role: 'user',
          content: '🎤 Voice message',
          created_at: new Date().toISOString(),
          source: 'voice',
        });

        setVoiceProcessing(true);
        voice.send({ type: 'audio', content: base64, mime_type: recorder.mimeType || 'audio/webm' });
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  if (!isAuthenticated) return null;

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* ── Left Sidebar: Conversations ── */}
      {sidebarOpen && (
        <div className="w-64 border-r bg-card/50 flex flex-col shrink-0">
          <div className="p-3 border-b flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-sm">Chats</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={createConversation}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-xs">No conversations</div>
            ) : (
              conversations.map((conv: any) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 px-3 py-2 mx-1.5 my-0.5 rounded-lg cursor-pointer transition text-sm ${
                    activeConversationId === conv.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => loadMessages(conv.id)}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{conv.title}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-5 w-5 opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Top Bar */}
        <div className="border-b px-4 py-2 flex items-center justify-between bg-card/50 shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(true)}>
                <MessageSquare className="h-4 w-4" />
              </Button>
            )}
            {sidebarOpen && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            )}
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">CareBridge AI</span>
            {callMode && (
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 animate-pulse">
                <Volume2 className="h-3 w-3 mr-1" /> Live
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedDocIds.size > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selectedDocIds.size} doc{selectedDocIds.size !== 1 ? 's' : ''}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPanelOpen(!panelOpen)}
              title="Documents"
            >
              <FileText className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {activeConversationId ? (
          <>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                {messages.length === 0 && (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Brain className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">How can I help you today?</h3>
                    <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
                      Ask me about your health documents. Select documents using the
                      <FileText className="inline h-3.5 w-3.5 mx-1" />
                      button above, or tap the mic to use voice.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[
                        'Explain my lab results',
                        'What does my blood test show?',
                        'Summarize my health records',
                      ].map((prompt) => (
                        <Button
                          key={prompt}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setInput(prompt)}
                        >
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg: any) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    {msg.role !== 'user' && (
                      <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[75%]`}>
                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted rounded-bl-md'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          <p className="text-sm">{msg.content}</p>
                        ) : (
                          <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.source === 'voice' && (
                          <span className="text-[10px] text-primary/60 flex items-center gap-0.5">
                            <Mic className="h-2.5 w-2.5" /> voice
                          </span>
                        )}
                        {/* Play button for all AI messages that have audio */}
                        {msg.role === 'assistant' && msg.audio_b64 && (
                          <AudioPlayButton audioB64={msg.audio_b64} audioMime={msg.audio_mime || 'audio/wav'} />
                        )}
                      </div>
                    </div>
                    {msg.role === 'user' && (
                      <div className="shrink-0 w-8 h-8 rounded-full bg-foreground flex items-center justify-center mt-1">
                        <User className="h-4 w-4 text-background" />
                      </div>
                    )}
                  </div>
                ))}

                {(isLoading || voiceProcessing) && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="shrink-0 border-t bg-background">
              <div className="max-w-3xl mx-auto px-4 pt-3 pb-2">
                {/* Recording indicator */}
                {isRecording && (
                  <div className="flex items-center justify-center gap-2 mb-2 py-1.5 px-3 rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Recording... tap mic to stop
                  </div>
                )}

                <div className="relative flex items-end bg-muted/50 border rounded-2xl px-4 py-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all">
                  <textarea
                    ref={inputRef}
                    placeholder={
                      callMode
                        ? 'Voice mode active — speak or type...'
                        : selectedDocIds.size > 0
                          ? `Message CareBridge about ${selectedDocIds.size} document${selectedDocIds.size !== 1 ? 's' : ''}...`
                          : 'Message CareBridge...'
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    rows={1}
                    className="flex-1 bg-transparent border-0 outline-none resize-none text-sm py-1.5 max-h-[200px] placeholder:text-muted-foreground/60"
                  />
                  <div className="flex items-center gap-1 ml-2 shrink-0 pb-0.5">
                    {/* Mic button — always visible for voice recording */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 rounded-full transition-all ${
                        isRecording
                          ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                          : 'text-muted-foreground hover:text-primary'
                      }`}
                      onClick={() => isRecording ? stopRecording() : startRecording()}
                      disabled={voiceProcessing}
                      title={isRecording ? 'Stop recording' : 'Record voice message'}
                    >
                      {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>

                    {/* Call mode toggle — phone icon swaps to phone-off */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 rounded-full transition-all ${
                        callMode
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'text-muted-foreground hover:text-primary'
                      }`}
                      onClick={() => callMode ? endCallMode() : startCallMode()}
                      title={callMode ? 'End live call (AI stops speaking)' : 'Start live call (AI speaks replies)'}
                    >
                      {callMode ? <PhoneOff className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                    </Button>

                    {/* Send button */}
                    <Button
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={sendMessage}
                      disabled={!input.trim() || isLoading}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Disclaimer */}
                <p className="text-[10px] text-muted-foreground text-center mt-2 pb-1">
                  CareBridge AI can make mistakes. This is not medical advice — always consult a healthcare professional.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <h3 className="text-lg font-medium">Start a conversation</h3>
              <p className="text-muted-foreground text-sm mt-2 max-w-sm mx-auto">
                Ask questions about your health documents with AI assistance
              </p>
              <Button className="mt-4" onClick={createConversation}>
                <Plus className="h-4 w-4 mr-2" /> New Chat
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right Panel: Document Selection ── */}
      {panelOpen && (
        <div className="w-72 border-l bg-card/50 flex flex-col shrink-0">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Documents</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPanelOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {userDocuments.length > 0 && (
              <>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-7" onClick={selectAll}>
                    <CheckCheck className="h-3 w-3 mr-1" /> All
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-7" onClick={deselectAll}>
                    <XSquare className="h-3 w-3 mr-1" /> None
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {selectedDocIds.size}/{userDocuments.length} selected
                </p>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {docsLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : userDocuments.length === 0 ? (
              <div className="p-6 text-center">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No documents</p>
                <Button variant="link" size="sm" className="mt-1" onClick={() => router.push('/dashboard/documents/upload')}>
                  Upload
                </Button>
              </div>
            ) : (
              userDocuments.map((doc: any) => {
                const isSelected = selectedDocIds.has(doc.id);
                return (
                  <div
                    key={doc.id}
                    className={`flex items-start gap-2.5 p-2.5 mx-1.5 my-0.5 rounded-lg cursor-pointer transition border ${
                      isSelected ? 'bg-primary/5 border-primary/30' : 'border-transparent hover:bg-muted'
                    }`}
                    onClick={() => toggleDoc(doc.id)}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{doc.filename}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded">
                          {doc.document_type || 'general'}
                        </span>
                        {analysisStatus[doc.id] === 'completed' && (
                          <span className="text-[9px] text-green-600 dark:text-green-400">✓</span>
                        )}
                        {analysisStatus[doc.id] === 'pending' && (
                          <span className="text-[9px] text-yellow-600 dark:text-yellow-400 animate-pulse">⏳</span>
                        )}
                        {analysisStatus[doc.id] === 'failed' && (
                          <span className="text-[9px] text-red-600 dark:text-red-400">✗</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t p-2">
            <p className="text-[9px] text-muted-foreground text-center">
              Selected docs are used by AI for answers
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
