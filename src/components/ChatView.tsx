import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { GatewayClient } from '../lib/gateway';
import { ChatMessage, AgentEvent } from '../types/gateway';
import { ChatMessageBubble } from './ChatMessage';
import { AgentEventDisplay } from './AgentEventDisplay';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  client: GatewayClient;
  sessionKey: string;
  streamingMessages: Map<string, string>;
  agentEvents: Map<string, AgentEvent[]>;
  activeRunIds: Set<string>;
  showThinking: boolean;
  streamEndCounter: number;
  onMarkRunActive: (runId: string) => void;
  onMarkRunInactive: (runId: string) => void;
  finishedRunIds: Set<string>;
  onClearFinishedStreams: () => void;
}

export function ChatView({ client, sessionKey, streamingMessages, agentEvents, activeRunIds, showThinking, streamEndCounter, onMarkRunActive, onMarkRunInactive, finishedRunIds, onClearFinishedStreams }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef('');
  const shouldAutoScroll = useRef(true);

  const isStreaming = activeRunIds.size > 0;
  // "Thinking" = active run but no streaming text yet
  const hasStreamingText = streamingMessages.size > 0 && Array.from(streamingMessages.values()).some(t => t.length > 0);
  const isThinking = isStreaming && !hasStreamingText;

  // Track if user is near bottom
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const threshold = 100;
    shouldAutoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Load history
  const loadHistory = useCallback(async () => {
    try {
      const result = await client.request<{ messages: ChatMessage[]; thinkingLevel?: string }>('chat.history', {
        sessionKey,
        limit: 200,
      });
      setMessages(result.messages || []);
    } catch { /* ignore */ }
  }, [client, sessionKey]);

  useEffect(() => {
    loadHistory();
    setTimeout(() => scrollToBottom('instant'), 100);
  }, [loadHistory, scrollToBottom]);

  // Reload history when a stream ends, then clear finished streaming messages
  useEffect(() => {
    if (streamEndCounter > 0) {
      loadHistory().then(() => {
        onClearFinishedStreams();
      });
    }
  }, [streamEndCounter, loadHistory, onClearFinishedStreams]);

  // Auto-scroll
  useEffect(() => {
    if (shouldAutoScroll.current) {
      scrollToBottom();
    }
  }, [messages, streamingMessages, isThinking, scrollToBottom]);

  const sendMessage = useCallback(async (text: string, fileAtts: { content: string; mimeType: string; fileName: string }[], localAttachments: { fileName: string; mimeType: string }[]) => {
    // Optimistic add
    const userMsg: ChatMessage & { localAttachments?: { fileName: string; mimeType: string }[] } = {
      role: 'user',
      content: text || '[attachment]',
      ts: Date.now(),
    };
    if (localAttachments.length > 0) {
      userMsg.localAttachments = localAttachments;
    }
    setMessages(prev => [...prev, userMsg]);

    shouldAutoScroll.current = true;
    setTimeout(() => scrollToBottom(), 50);

    const runId = uuid();
    // Mark run as active immediately so thinking dots show
    onMarkRunActive(runId);

    try {
      await client.request('chat.send', {
        sessionKey,
        message: text || 'See attached file(s)',
        attachments: fileAtts.length > 0 ? fileAtts : undefined,
        idempotencyKey: runId,
      });
    } catch (err) {
      console.error('Send failed:', err);
      // Remove on failure so dots disappear
      onMarkRunInactive(runId);
    }
  }, [client, sessionKey, scrollToBottom]);

  const handleSend = async () => {
    const text = inputRef.current.trim();
    if (!text && attachments.length === 0) return;

    setSending(true);
    inputRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }

    // Build attachments for API
    const fileAtts = await Promise.all(
      attachments.map(async (file) => {
        const buf = await file.arrayBuffer();
        const b64 = btoa(
          new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        return {
          content: b64,
          mimeType: file.type || 'application/octet-stream',
          fileName: file.name,
        };
      })
    );

    const localAttachments = attachments.map(f => ({
      fileName: f.name,
      mimeType: f.type || 'application/octet-stream',
    }));

    setAttachments([]);
    await sendMessage(text, fileAtts, localAttachments);
    setSending(false);
  };

  const handleAbort = async () => {
    try {
      await client.request('chat.abort', { sessionKey });
    } catch { /* ignore */ }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    inputRef.current = e.target.value;
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        {messages.map((msg, i) => (
          <ChatMessageBubble key={i} message={msg} showThinking={showThinking} />
        ))}

        {/* Active agent events */}
        {Array.from(agentEvents.entries()).map(([runId, events]) => (
          <AgentEventDisplay key={runId} events={events} />
        ))}

        {/* Thinking indicator — shown when active run but no text yet */}
        {isThinking && (
          <div className="flex justify-start mb-3">
            <div className="rounded-xl px-4 py-3 bg-bg-tertiary">
              <div className="flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="text-sm text-text-muted">thinking...</span>
              </div>
            </div>
          </div>
        )}

        {/* Streaming responses (hide finished ones — history will show them) */}
        {Array.from(streamingMessages.entries()).map(([runId, text]) => {
          if (!text || finishedRunIds.has(runId)) return null;
          return (
            <div key={runId} className="flex justify-start mb-3">
              <div className="max-w-[80%] rounded-xl px-4 py-3 bg-bg-tertiary">
                <div className="prose prose-invert prose-sm max-w-none text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                </div>
                <div className="flex items-center gap-1 mt-2">
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
                  <span className="text-[10px] text-text-muted">streaming...</span>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 flex gap-2 flex-wrap border-t border-border">
          {attachments.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-bg-tertiary rounded px-2 py-1 text-xs">
              <span className="truncate max-w-[120px]">{f.name}</span>
              <button
                onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                className="text-text-muted hover:text-error"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input — always enabled so you can queue messages */}
      <div className="border-t border-border p-4">
        {isStreaming && (
          <div className="text-xs text-text-muted mb-2">
            You can type while waiting — your message will be queued.
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Attach file"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <textarea
            ref={textareaRef}
            defaultValue=""
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "Type to queue a message..." : "Type a message..."}
            rows={1}
            className="flex-1 bg-bg-tertiary border border-border rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-accent"
          />
          {isStreaming && (
            <button
              onClick={handleAbort}
              className="px-4 py-2.5 bg-error/20 text-error rounded-lg text-sm font-medium hover:bg-error/30 transition-colors shrink-0"
            >
              Stop
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
