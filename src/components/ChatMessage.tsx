import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage as ChatMessageType } from '../types/gateway';

interface Props {
  message: ChatMessageType;
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

export function ChatMessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const text = extractText(message.content);

  if (!text.trim()) return null;

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
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{text}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
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
