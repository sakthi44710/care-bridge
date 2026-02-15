'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useChatStore } from '@/lib/store';
import { chatApi, documentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import {
  MessageSquare, Plus, Send, ArrowLeft, Trash2, Loader2,
  Bot, User, Clock, Brain, FileText, PanelRightClose, PanelRightOpen,
  CheckSquare, Square, CheckCheck, XSquare,
} from 'lucide-react';

export default function ChatPage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const {
    activeConversationId, setActiveConversation,
    conversations, setConversations,
    messages, setMessages, addMessage,
    isLoading, setLoading,
  } = useChatStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Document panel state
  const [panelOpen, setPanelOpen] = useState(true);
  const [userDocuments, setUserDocuments] = useState<any[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docsLoading, setDocsLoading] = useState(false);

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

  const sendMessage = async () => {
    if (!input.trim() || !activeConversationId || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      created_at: new Date().toISOString(),
    };

    addMessage(userMessage);
    setInput('');
    setLoading(true);

    try {
      const docIds = selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined;
      const response = await chatApi.sendMessage(activeConversationId, input, docIds);
      addMessage(response.data);
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

  // Document selection helpers
  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedDocIds(new Set(userDocuments.map((d: any) => d.id)));
  };

  const deselectAll = () => {
    setSelectedDocIds(new Set());
  };

  if (!isAuthenticated) return null;

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* ── Left Sidebar: Conversations ── */}
      <div className="w-72 border-r bg-card flex flex-col shrink-0">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h2 className="font-semibold text-sm">AI Health Chat</h2>
            <Button variant="ghost" size="icon" onClick={createConversation}>
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv: any) => (
              <div
                key={conv.id}
                className={`flex items-center gap-3 p-3 mx-2 my-1 rounded-lg cursor-pointer transition ${
                  activeConversationId === conv.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                }`}
                onClick={() => loadMessages(conv.id)}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conv.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Center: Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {activeConversationId ? (
          <>
            {/* Top bar with panel toggle */}
            <div className="border-b px-4 py-2 flex items-center justify-between bg-card">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Chat</span>
                {selectedDocIds.size > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {selectedDocIds.size} doc{selectedDocIds.size !== 1 ? 's' : ''} selected
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPanelOpen(!panelOpen)}
                title={panelOpen ? 'Hide documents panel' : 'Show documents panel'}
              >
                {panelOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <Brain className="h-12 w-12 mx-auto text-primary/30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">AI Health Assistant</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Select documents from the right panel, then ask questions.
                    The AI will analyze only the documents you select.
                  </p>
                  {selectedDocIds.size === 0 && userDocuments.length > 0 && (
                    <p className="text-amber-500 text-sm mt-3">
                      ⚠ No documents selected. Open the panel on the right to select documents.
                    </p>
                  )}
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {[
                      'Explain my lab results',
                      'What does my blood test show?',
                      'Summarize my health records',
                    ].map((prompt) => (
                      <Button
                        key={prompt}
                        variant="outline"
                        size="sm"
                        onClick={() => { setInput(prompt); }}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg: any) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role !== 'user' && (
                    <div className="bg-primary/10 h-8 w-8 rounded-full flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[70%] rounded-lg p-4 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p>{msg.content}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs opacity-70">
                      <Clock className="h-3 w-3" />
                      {new Date(msg.created_at).toLocaleTimeString()}
                      {msg.model_used && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {msg.model_used}
                        </Badge>
                      )}
                      {msg.latency_ms && (
                        <span>{msg.latency_ms}ms</span>
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="bg-foreground h-8 w-8 rounded-full flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-background" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="bg-primary/10 h-8 w-8 rounded-full flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-4">
              <div className="flex gap-2 max-w-3xl mx-auto">
                <Input
                  placeholder={
                    selectedDocIds.size > 0
                      ? `Ask about ${selectedDocIds.size} selected document${selectedDocIds.size !== 1 ? 's' : ''}...`
                      : 'Select documents from the panel, then ask...'
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button onClick={sendMessage} disabled={!input.trim() || isLoading}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                AI responses are for educational purposes only. Always consult healthcare professionals.
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium">Select or create a conversation</h3>
              <p className="text-muted-foreground mt-2">
                Start a new conversation to ask questions about your health documents
              </p>
              <Button className="mt-4" onClick={createConversation}>
                <Plus className="h-4 w-4 mr-2" />
                New Conversation
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right Panel: Document Selection ── */}
      {activeConversationId && panelOpen && (
        <div className="w-80 border-l bg-card flex flex-col shrink-0">
          {/* Panel header */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Documents</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPanelOpen(false)}
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>

            {/* Select All / Deselect All */}
            {userDocuments.length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={selectAll}
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={deselectAll}
                >
                  <XSquare className="h-3 w-3 mr-1" />
                  Deselect All
                </Button>
              </div>
            )}

            {userDocuments.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {selectedDocIds.size} of {userDocuments.length} selected
              </p>
            )}
          </div>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto">
            {docsLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : userDocuments.length === 0 ? (
              <div className="p-6 text-center">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No documents uploaded</p>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-2"
                  onClick={() => router.push('/dashboard/documents/upload')}
                >
                  Upload a document
                </Button>
              </div>
            ) : (
              userDocuments.map((doc: any) => {
                const isSelected = selectedDocIds.has(doc.id);
                return (
                  <div
                    key={doc.id}
                    className={`flex items-start gap-3 p-3 mx-2 my-1 rounded-lg cursor-pointer transition border ${
                      isSelected
                        ? 'bg-primary/5 border-primary/30'
                        : 'border-transparent hover:bg-muted'
                    }`}
                    onClick={() => toggleDoc(doc.id)}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" title={doc.filename}>
                        {doc.filename}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {doc.document_type || 'general'}
                        </Badge>
                        {doc.ocr_confidence != null && (
                          <span className="text-[10px] text-muted-foreground">
                            OCR {(doc.ocr_confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Panel footer hint */}
          <div className="border-t p-3">
            <p className="text-[10px] text-muted-foreground text-center">
              Only selected documents will be used by the AI for answers.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
