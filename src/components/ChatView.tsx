import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { v4 as uuid } from 'uuid';
import { GatewayClient } from '../lib/gateway';
import { ChatMessage, AgentEvent, ContentBlock } from '../types/gateway';
import { classifyThinking } from '../lib/thinkingClassifier';
import { ChatMessageBubble } from './ChatMessage';
import { AgentEventDisplay } from './AgentEventDisplay';
import { ChatInput } from './ChatInput';
import { StreamingBubble } from './StreamingBubble';
import { useReactions } from '../hooks/useReactions';

const HEARTBEAT_PROMPT = 'Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.';

// Detect messages that are a single emoji (for auto-reaction)
const EMOJI_ONLY_RE = /^\p{Emoji_Presentation}$/u;
function isSingleEmoji(text: string): boolean {
  const t = text.trim();
  // Handle multi-codepoint emoji (👍, ❤️, etc.)
  if (EMOJI_ONLY_RE.test(t)) return true;
  // Segmenter approach for complex emoji
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segs = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(t)];
    if (segs.length === 1) {
      // Check if it's emoji-like (not a letter/number)
      return /\p{Emoji}/u.test(t) && !/^[0-9a-zA-Z]$/.test(t);
    }
  }
  return false;
}

function extractMessageText(msg: ChatMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return (msg.content as ContentBlock[]).filter(b => b.type === 'text').map(b => b.text || '').join('');
  }
  return '';
}

const MAX_INLINE_BYTES = 512 * 1024; // 0.5 MB — WebSocket payload limit for inline base64
// Use the same host the browser is connected to (works for LAN access)
const UPLOAD_URL = `http://${window.location.hostname}:9089/upload`;

function isToolMessage(msg: ChatMessage): boolean {
  if (!Array.isArray(msg.content)) return false;
  const blocks = msg.content as ContentBlock[];
  // Assistant messages with only tool_use blocks (no text) are tool calls
  // User messages with tool_result blocks are tool outputs
  const hasToolUse = blocks.some(b => b.type === 'tool_use');
  const hasToolResult = blocks.some(b => b.type === 'tool_result');
  if (hasToolResult) return true;
  if (hasToolUse) {
    // If there's meaningful text alongside tool_use, keep it
    const hasText = blocks.some(b => b.type === 'text' && (b.text || '').trim());
    return !hasText;
  }
  return false;
}

function isHeartbeatMessage(msg: ChatMessage): boolean {
  let text = '';
  if (typeof msg.content === 'string') {
    text = msg.content;
  } else if (Array.isArray(msg.content)) {
    text = msg.content.map(b => b.text || '').join('');
  }
  const trimmed = text.trim();
  if (trimmed === 'HEARTBEAT_OK') return true;
  if (trimmed === HEARTBEAT_PROMPT) return true;
  // Also match if wrapped with other system text (e.g. timestamps)
  if (trimmed.endsWith(HEARTBEAT_PROMPT)) return true;
  return false;
}

interface Props {
  client: GatewayClient;
  sessionKey: string;
  streamingMessages: Map<string, string>;
  agentEvents: Map<string, AgentEvent[]>;
  activeRunIds: Set<string>;
  showThinking: boolean;
  thinkingLevel: string | null;
  onAutoResolvedLevel: (level: string | null) => void;
  streamEndCounter: number;
  onMarkRunActive: (runId: string) => void;
  onMarkRunInactive: (runId: string) => void;
  finishedRunIds: Set<string>;
  onClearFinishedStreams: () => void;
}

export function ChatView({ client, sessionKey, streamingMessages, agentEvents, activeRunIds, showThinking, thinkingLevel, onAutoResolvedLevel, streamEndCounter, onMarkRunActive, onMarkRunInactive, finishedRunIds, onClearFinishedStreams }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const { addReaction, removeReaction, getReaction } = useReactions(sessionKey);

  const isStreaming = activeRunIds.size > 0;
  // "Thinking" = active run but no streaming text yet
  const hasStreamingText = streamingMessages.size > 0 && Array.from(streamingMessages.values()).some(t => t.length > 0);
  const isThinking = isStreaming && !hasStreamingText;

  // Track if user is near bottom
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const threshold = 100;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    shouldAutoScroll.current = nearBottom;
    setShowScrollButton(!nearBottom);
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
      setMessages((result.messages || []).filter(m => !isHeartbeatMessage(m)));

    } catch { /* ignore */ }
  }, [client, sessionKey]);

  useEffect(() => {
    loadHistory();
    setTimeout(() => scrollToBottom('instant'), 100);
  }, [loadHistory, scrollToBottom]);

  // Reload history when a stream ends, then clear finished streaming messages
  const [clearedStreamIds, setClearedStreamIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (streamEndCounter > 0) {
      loadHistory().then(() => {
        // Mark finished streams as cleared AFTER history is loaded
        setClearedStreamIds(new Set(finishedRunIds));
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

  const handleSendFromInput = useCallback(async (text: string, fileAtts: { content: string; mimeType: string; fileName: string }[], localAttachments: { fileName: string; mimeType: string }[]) => {
    setSending(true);

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
    onMarkRunActive(runId);

    try {
      // Auto-thinking: classify message and set thinking level before sending
      if (thinkingLevel === 'auto' && text) {
        const autoLevel = classifyThinking(text);
        onAutoResolvedLevel(autoLevel);
        try {
          await client.request('sessions.patch', {
            key: sessionKey,
            thinkingLevel: autoLevel,
          });
        } catch (err) {
          console.error('Auto-thinking patch failed:', err);
        }
      }

      await client.request('chat.send', {
        sessionKey,
        message: text || 'See attached file(s)',
        attachments: fileAtts.length > 0 ? fileAtts : undefined,
        idempotencyKey: runId,
      });
    } catch (err) {
      console.error('Send failed:', err);
      onMarkRunInactive(runId);
    } finally {
      setSending(false);
    }
  }, [client, sessionKey, scrollToBottom, thinkingLevel]);

  // Process emoji-only assistant messages as auto-reactions on previous user message
  const emojiAutoReactions = useMemo(() => {
    const hidden = new Set<number>();
    const autoReactions = new Map<number, string[]>(); // target msg index -> emojis
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        const text = extractMessageText(msg).trim();
        if (isSingleEmoji(text)) {
          // Find previous user message
          for (let j = i - 1; j >= 0; j--) {
            if (messages[j].role === 'user') {
              hidden.add(i);
              const existing = autoReactions.get(j) || [];
              existing.push(text);
              autoReactions.set(j, existing);
              break;
            }
          }
        }
      }
    }
    return { hidden, autoReactions };
  }, [messages]);

  const filteredMessages = useMemo(() => {
    return messages.filter((m, i) => {
      if (emojiAutoReactions.hidden.has(i)) return false;
      // Hide assistant messages that are just "[emoji-reaction]" (failed reaction attempts)
      if (m.role === 'assistant') {
        const text = extractMessageText(m).trim();
        if (text.startsWith('[emoji-reaction]') || text.startsWith('[emoji reaction')) return false;
      }
      return showThinking || !isToolMessage(m);
    });
  }, [messages, showThinking, emojiAutoReactions]);

  // Map from filtered index back to original index for reaction keying
  const filteredToOriginal = useMemo(() => {
    const map: number[] = [];
    messages.forEach((m, i) => {
      if (emojiAutoReactions.hidden.has(i)) return;
      if (!showThinking && isToolMessage(m)) return;
      map.push(i);
    });
    return map;
  }, [messages, showThinking, emojiAutoReactions]);

  const INITIAL_RENDER_LIMIT = 50;
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT);

  // Reset render limit when session changes
  useEffect(() => {
    setRenderLimit(INITIAL_RENDER_LIMIT);
  }, [sessionKey]);

  const visibleMessages = useMemo(() => {
    if (filteredMessages.length <= renderLimit) return filteredMessages;
    return filteredMessages.slice(filteredMessages.length - renderLimit);
  }, [filteredMessages, renderLimit]);

  const hasOlderMessages = filteredMessages.length > renderLimit;

  const handleAbort = useCallback(async () => {
    try {
      await client.request('chat.abort', { sessionKey });
    } catch { /* ignore */ }
  }, [client, sessionKey]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        {hasOlderMessages && (
          <div className="flex justify-center mb-4">
            <button
              onClick={() => setRenderLimit(prev => prev + 50)}
              className="text-xs text-accent hover:text-accent-hover px-3 py-1.5 bg-bg-tertiary rounded-lg border border-border hover:border-accent transition-colors"
            >
              Load older messages ({filteredMessages.length - renderLimit} hidden)
            </button>
          </div>
        )}
        {visibleMessages.map((msg, i) => {
          const offsetIdx = filteredMessages.length <= renderLimit ? i : i + (filteredMessages.length - renderLimit);
          const origIdx = filteredToOriginal[offsetIdx] ?? offsetIdx;
          const autoEmojis = emojiAutoReactions.autoReactions.get(origIdx) || [];
          // Stable reaction key: hash role + timestamp + first 80 chars of text content.
          // extractMessageText normalizes content format (string vs ContentBlock[]).
          const msgText = extractMessageText(msg).slice(0, 80);
          const msgKey = `${msg.role}:${msg.ts || 0}:${msgText}`;
          const storedReaction = getReaction(msgKey);
          // Auto-reaction from assistant emoji-only messages takes priority if no stored reaction
          const autoR = autoEmojis.length > 0 ? { emoji: autoEmojis[0], source: 'assistant' as const } : null;
          const reaction = storedReaction || autoR;
          return (
            <ChatMessageBubble
              key={i}
              message={msg}
              showThinking={showThinking}
              reaction={reaction}
              onReact={(emoji) => {
                addReaction(msgKey, emoji, 'user');
                // Notify the gateway so the agent sees the reaction
                const snippet = extractMessageText(msg).slice(0, 100);
                client.request('chat.inject', {
                  sessionKey,
                  message: `[emoji reaction: ${emoji} on "${snippet}"]`,
                  label: 'emoji-reaction',
                }).catch(() => { /* best effort */ });
              }}
              onRemoveReaction={() => removeReaction(msgKey)}
            />
          );
        })}

        {/* Active agent events */}
        {Array.from(agentEvents.entries()).map(([runId, events]) => (
          <AgentEventDisplay key={runId} events={events} />
        ))}

        {/* Thinking indicator — shown when active run but no text yet */}
        {isThinking && (
          <div className="flex justify-start mb-3">
            <div className="rounded-xl px-4 py-3 bg-bg-tertiary border animate-stream-pulse">
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

        {/* Streaming responses — keep showing until history has loaded the final version */}
        {Array.from(streamingMessages.entries()).map(([runId, text]) => {
          if (!text || clearedStreamIds.has(runId)) return null;
          return (
            <StreamingBubble
              key={runId}
              text={text}
              isFinished={finishedRunIds.has(runId)}
            />
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="relative">
          <button
            onClick={() => { scrollToBottom(); setShowScrollButton(false); }}
            className="absolute bottom-2 right-4 w-9 h-9 rounded-full bg-bg-secondary border border-border shadow-lg flex items-center justify-center hover:bg-bg-hover transition-colors z-10"
            title="Scroll to bottom"
          >
            <span className="text-text-secondary text-lg leading-none">↓</span>
          </button>
        </div>
      )}

      <ChatInput
        isStreaming={isStreaming}
        sending={sending}
        onSend={handleSendFromInput}
        onAbort={handleAbort}
      />
    </div>
  );
}
