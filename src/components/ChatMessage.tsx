import { useState, memo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage as ChatMessageType, ContentBlock } from '../types/gateway';
import { CodeBlock } from './CodeBlock';
import type { Reaction } from '../hooks/useReactions';

const REACTION_EMOJIS = ['🙂', '👍', '👎', '😊', '😂', '❤️', '🔥', '🤔', '👀', '🎉', '😮', '🙏'];

interface Props {
  message: ChatMessageType;
  showThinking?: boolean;
  reaction?: Reaction | null;
  onReact?: (emoji: string) => void;
  onRemoveReaction?: () => void;
}

function extractText(content: ChatMessageType['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('\n');
  }
  return '';
}

function extractThinking(content: ChatMessageType['content']): string | null {
  if (!Array.isArray(content)) return null;
  const thinkingBlocks = (content as ContentBlock[])
    .filter(b => b.type === 'thinking' && b.thinking)
    .map(b => (b as Record<string, unknown>).thinking as string);
  if (thinkingBlocks.length === 0) return null;
  return thinkingBlocks.join('\n\n');
}

interface AttachmentInfo {
  fileName: string;
  mimeType: string;
  data?: string; // base64
  url?: string;
}

function extractAttachments(content: ChatMessageType['content']): AttachmentInfo[] {
  if (!Array.isArray(content)) return [];
  const atts: AttachmentInfo[] = [];
  for (const block of content as ContentBlock[]) {
    const b = block as Record<string, unknown>;

    // Image blocks — gateway puts data directly on block, not in source
    if (block.type === 'image') {
      const source = (b.source || {}) as Record<string, string>;
      const data = (b.data || source.data || '') as string;
      const mimeType = (b.media_type || b.mediaType || source.media_type || source.mediaType || 'image/png') as string;
      if (data) {
        atts.push({
          fileName: (b.fileName as string) || 'image',
          mimeType,
          data,
        });
      }
    }
    // Document/file blocks
    else if (block.type === 'document' || block.type === 'file') {
      atts.push({
        fileName: (b.fileName || b.name || 'file') as string,
        mimeType: (b.mimeType || b.media_type || 'application/octet-stream') as string,
        data: b.data as string,
        url: b.url as string,
      });
    }
    // Media text attachments (from gateway)
    else if (block.type === 'media' || (block.type === 'text' && b.mediaType)) {
      if (b.fileName || b.mediaType) {
        atts.push({
          fileName: (b.fileName || 'attachment') as string,
          mimeType: (b.mediaType || b.mimeType || 'application/octet-stream') as string,
          data: b.data as string,
          url: b.url as string,
        });
      }
    }
  }
  return atts;
}

function isViewable(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType.startsWith('text/') || mimeType === 'application/pdf';
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('text/')) return '📝';
  return '📎';
}

function FileAttachment({ att }: { att: AttachmentInfo }) {
  const [preview, setPreview] = useState(false);

  const handleClick = () => {
    if (att.data) {
      const dataUrl = `data:${att.mimeType};base64,${att.data}`;
      if (isViewable(att.mimeType)) {
        if (att.mimeType.startsWith('image/')) {
          setPreview(!preview);
          return;
        }
        window.open(dataUrl, '_blank');
      } else {
        // Download
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = att.fileName;
        link.click();
      }
    } else if (att.url) {
      window.open(att.url, '_blank');
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors bg-bg-primary/50 rounded px-2 py-1 border border-border/50"
        title={isViewable(att.mimeType) ? 'Click to view' : 'Click to download'}
      >
        <span>{getFileIcon(att.mimeType)}</span>
        <span className="truncate max-w-[200px]">{att.fileName}</span>
        {!isViewable(att.mimeType) && <span className="text-text-muted">⬇</span>}
      </button>
      {/* Inline image preview */}
      {preview && att.mimeType.startsWith('image/') && att.data && (
        <div className="mt-2">
          <img
            src={`data:${att.mimeType};base64,${att.data}`}
            alt={att.fileName}
            className="max-w-full max-h-80 rounded-lg border border-border/50 cursor-pointer"
            onClick={() => window.open(`data:${att.mimeType};base64,${att.data}`, '_blank')}
          />
        </div>
      )}
    </div>
  );
}

function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute z-50 bg-bg-secondary border border-border rounded-lg shadow-lg p-1.5 flex gap-0.5 flex-wrap w-[220px]">
      {REACTION_EMOJIS.map(e => (
        <button key={e} onClick={() => { onSelect(e); onClose(); }} className="w-8 h-8 flex items-center justify-center rounded hover:bg-bg-hover text-base transition-colors">
          {e}
        </button>
      ))}
    </div>
  );
}

function ReactionBadge({ reaction, onRemove, isUser }: { reaction: Reaction | null; onRemove?: () => void; isUser?: boolean }) {
  if (!reaction) return null;
  const borderColor = reaction.source === 'user' ? 'border-accent/50' : 'border-emerald-500/50';
  return (
    <div className={`absolute -bottom-3 -right-3 z-10`}>
      <span className={`group/badge text-sm px-1.5 py-0.5 rounded-full bg-bg-secondary border ${borderColor} shadow-sm flex items-center gap-0.5 cursor-pointer hover:border-red-400/60 transition-colors`}
        onClick={onRemove}
        title="Click to remove"
      >
        {reaction.emoji}
        <span className="hidden group-hover/badge:inline text-[9px] text-red-400 ml-0.5">✕</span>
      </span>
    </div>
  );
}

function propsAreEqual(prev: Props, next: Props): boolean {
  if (prev.showThinking !== next.showThinking) return false;
  if (prev.reaction !== next.reaction) return false;
  const pm = prev.message;
  const nm = next.message;
  if (pm === nm) return true;
  if (pm.role !== nm.role) return false;
  if (pm.ts !== nm.ts) return false;
  const prevText = extractText(pm.content);
  const nextText = extractText(nm.content);
  return prevText === nextText;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({ message, showThinking, reaction = null, onReact, onRemoveReaction }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const text = extractText(message.content);
  const thinking = showThinking ? extractThinking(message.content) : null;
  const attachments = extractAttachments(message.content);
  const localAtts = (message as unknown as Record<string, unknown>).localAttachments as AttachmentInfo[] | undefined;
  const allAttachments = [...attachments, ...(localAtts || [])];
  const [showPicker, setShowPicker] = useState(false);
  const [showReactButton, setShowReactButton] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    if (!onReact || isUser) return;
    longPressTimer.current = setTimeout(() => {
      setShowReactButton(true);
    }, 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };
  const handleTouchMove = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  if (!text.trim() && !thinking && allAttachments.length === 0) return null;

  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className="relative max-w-[95%] md:max-w-[80%]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        {/* Reaction button — hover on desktop, long-press on mobile */}
        {onReact && !isUser && (
          <div className={`absolute -top-2 ${isUser ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} ${showReactButton ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity z-10`}>
            <button
              onClick={() => setShowPicker(p => !p)}
              className="w-6 h-6 rounded-full bg-bg-secondary border border-border text-xs flex items-center justify-center hover:bg-bg-hover transition-colors"
              title="Add reaction"
            >
              😊
            </button>
            {showPicker && (
              <div className={`absolute top-7 ${isUser ? 'right-0' : 'left-0'}`}>
                <EmojiPicker onSelect={(e) => { onReact(e); setShowReactButton(false); }} onClose={() => { setShowPicker(false); setShowReactButton(false); }} />
              </div>
            )}
          </div>
        )}
      <div
        className={`rounded-xl px-4 py-3 ${
          isUser
            ? 'bg-accent/20 text-text-primary'
            : isSystem
            ? 'bg-warning/10 text-warning border border-warning/20'
            : 'bg-bg-tertiary text-text-primary'
        }`}
      >
        {/* Thinking block */}
        {thinking && (
          <details className="mb-3" open>
            <summary className="text-xs text-text-muted cursor-pointer select-none mb-1 flex items-center gap-1">
              <span className="opacity-70">🧠</span>
              <span>Thinking</span>
            </summary>
            <div className="text-xs text-text-secondary bg-bg-primary/50 rounded-lg p-3 border border-border/50 max-h-64 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-sans">{thinking}</pre>
            </div>
          </details>
        )}

        {/* Message content */}
        {text.trim() && (
          isUser ? (
            <p className="text-sm whitespace-pre-wrap">{text}</p>
          ) : (
            <div className="prose prose-sm max-w-none text-sm [&_*]:text-inherit">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  a: ((props: any) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  )) as any,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  pre: ((props: any) => {
                    return <CodeBlock inline={false}>{props.children}</CodeBlock>;
                  }) as any,
                }}
              >{text}</ReactMarkdown>
            </div>
          )
        )}

        {/* Attachments */}
        {allAttachments.length > 0 && (
          <div className="flex flex-col gap-1">
            {allAttachments.map((att, i) => (
              <FileAttachment key={i} att={att} />
            ))}
          </div>
        )}

        {message.ts && (
          <div className="text-[10px] text-text-muted mt-1">
            {new Date(message.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} {new Date(message.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>
      <ReactionBadge reaction={reaction} onRemove={onRemoveReaction} isUser={isUser} />
      </div>
    </div>
  );
}, propsAreEqual);
