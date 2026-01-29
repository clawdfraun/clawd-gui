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
}

export function ChatView({ client, sessionKey, streamingMessages, agentEvents, activeRunIds }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = activeRunIds.size > 0;

  // Load history
  const loadHistory = useCallback(async () => {
    try {
      const result = await client.request<{ messages: ChatMessage[] }>('chat.history', {
        sessionKey,
        limit: 200,
      });
      setMessages(result.messages || []);
    } catch { /* ignore */ }
  }, [client, sessionKey]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    setSending(true);
    setInput('');

    // Build attachments
    const atts = await Promise.all(
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
    setAttachments([]);

    // Optimistic add
    setMessages(prev => [...prev, { role: 'user', content: text || '[attachment]', ts: Date.now() }]);

    try {
      await client.request('chat.send', {
        sessionKey,
        message: text || 'See attached file(s)',
        attachments: atts.length > 0 ? atts : undefined,
        idempotencyKey: uuid(),
      });
    } catch (err) {
      console.error('Send failed:', err);
    }

    setSending(false);

    // Reload history after a delay to get the full response
    setTimeout(loadHistory, 2000);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <ChatMessageBubble key={i} message={msg} />
        ))}

        {/* Active agent events */}
        {Array.from(agentEvents.entries()).map(([runId, events]) => (
          <AgentEventDisplay key={runId} events={events} />
        ))}

        {/* Streaming responses */}
        {Array.from(streamingMessages.entries()).map(([runId, text]) => (
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
        ))}

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

      {/* Input */}
      <div className="border-t border-border p-4">
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
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-bg-tertiary border border-border rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-accent"
          />
          {isStreaming ? (
            <button
              onClick={handleAbort}
              className="px-4 py-2.5 bg-error/20 text-error rounded-lg text-sm font-medium hover:bg-error/30 transition-colors shrink-0"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={sending || (!input.trim() && attachments.length === 0)}
              className="px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-lg text-sm font-medium transition-colors shrink-0"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
