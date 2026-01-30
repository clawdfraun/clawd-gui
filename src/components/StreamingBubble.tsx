import { memo, useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  text: string;
  isFinished: boolean;
}

const THROTTLE_MS = 150;

export const StreamingBubble = memo(function StreamingBubble({ text, isFinished }: Props) {
  // Throttle markdown rendering: only update rendered text every THROTTLE_MS
  const [renderedText, setRenderedText] = useState(text);
  const lastUpdateRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isFinished) {
      // Show final text immediately
      if (timerRef.current) clearTimeout(timerRef.current);
      setRenderedText(text);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= THROTTLE_MS) {
      setRenderedText(text);
      lastUpdateRef.current = now;
    } else {
      // Schedule an update for the remaining time
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setRenderedText(text);
        lastUpdateRef.current = Date.now();
      }, THROTTLE_MS - elapsed);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text, isFinished]);

  return (
    <div className="flex justify-start mb-3">
      <div className={`max-w-[80%] rounded-xl px-4 py-3 bg-bg-tertiary border${isFinished ? '' : ' animate-stream-pulse'}`}>
        <div className="prose prose-sm max-w-none text-sm [&_*]:text-inherit">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedText}</ReactMarkdown>
        </div>
        {!isFinished && (
          <div className="flex items-center gap-1 mt-2">
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            <span className="text-[10px] text-text-muted">streaming...</span>
          </div>
        )}
      </div>
    </div>
  );
});
