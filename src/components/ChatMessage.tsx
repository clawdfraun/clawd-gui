import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage as ChatMessageType, ContentBlock } from '../types/gateway';

interface Props {
  message: ChatMessageType;
  showThinking?: boolean;
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

export function ChatMessageBubble({ message, showThinking }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const text = extractText(message.content);
  const thinking = showThinking ? extractThinking(message.content) : null;
  const attachments = extractAttachments(message.content);
  // Also check for local attachments stored on the message
  const localAtts = (message as Record<string, unknown>).localAttachments as AttachmentInfo[] | undefined;
  const allAttachments = [...attachments, ...(localAtts || [])];

  if (!text.trim() && !thinking && allAttachments.length === 0) return null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 ${
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
            <div className="prose prose-invert prose-sm max-w-none text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
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
            {new Date(message.ts).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
