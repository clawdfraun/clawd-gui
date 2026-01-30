import { useState, useCallback, type ReactNode } from 'react';

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

export function CodeBlock({ inline, className, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = extractTextFromChildren(children).replace(/\n$/, '');
    // navigator.clipboard requires HTTPS; use fallback for LAN HTTP
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [children]);

  // Inline code — no copy button
  if (inline) {
    return <code className={className}>{children}</code>;
  }

  // Block code — wrap with copy button overlay
  return (
    <div className="relative group my-2">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-text-muted hover:text-text-primary transition-all opacity-70 hover:opacity-100 z-10 cursor-pointer"
        title={copied ? 'Copied!' : 'Copy to clipboard'}
        aria-label="Copy code"
      >
        {copied ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <pre className={className}>{children}</pre>
    </div>
  );
}

/** Recursively extract plain text from React children */
function extractTextFromChildren(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (!children) return '';
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('');
  if (typeof children === 'object' && 'props' in children) {
    return extractTextFromChildren((children as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}
