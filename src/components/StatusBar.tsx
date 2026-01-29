import { useState, useEffect, useCallback } from 'react';
import { GatewayClient } from '../lib/gateway';
import { SessionEntry } from '../types/gateway';

type ThemeMode = 'dark' | 'light' | 'system';

const THEME_KEY = 'clawd-gui-theme';

// Known Anthropic model context windows
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-5': 200000,
  'claude-sonnet-4': 200000,
  'claude-haiku-3-5': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
};

function getContextWindow(model: string | undefined): number | null {
  if (!model) return null;
  const shortName = model.split('/').pop() || model;
  // Try exact match first, then prefix match
  if (MODEL_CONTEXT_WINDOWS[shortName]) return MODEL_CONTEXT_WINDOWS[shortName];
  for (const [key, val] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (shortName.startsWith(key) || shortName.includes(key)) return val;
  }
  // Default for any claude model
  if (shortName.includes('claude')) return 200000;
  return null;
}

function isAnthropicModel(model: string | undefined): boolean {
  if (!model) return false;
  return model.includes('anthropic') || model.includes('claude');
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

interface Props {
  client: GatewayClient | null;
  session: SessionEntry | undefined;
  connected: boolean;
}

export function StatusBar({ client, session, connected }: Props) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem(THEME_KEY) as ThemeMode) || 'dark';
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme(prev => {
      const order: ThemeMode[] = ['dark', 'light', 'system'];
      return order[(order.indexOf(prev) + 1) % order.length];
    });
  }, []);

  const themeIcon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻';

  // Context window
  const model = session?.model;
  const totalTokens = session?.totalTokens ?? 0;
  const contextWindow = getContextWindow(model);
  const contextPct = contextWindow ? Math.min(100, (totalTokens / contextWindow) * 100) : null;

  // Anthropic usage (session-level token usage as a bar)
  const isAnthropic = isAnthropicModel(model);

  return (
    <footer className="flex items-center justify-between px-4 py-1.5 bg-bg-secondary border-t border-border text-[11px] text-text-muted shrink-0 gap-4">
      {/* Left: Theme switcher */}
      <button
        onClick={cycleTheme}
        className="flex items-center gap-1 hover:text-text-secondary transition-colors"
        title={`Theme: ${theme}`}
      >
        <span>{themeIcon}</span>
        <span className="capitalize">{theme}</span>
      </button>

      {/* Center: Context window */}
      {connected && session && contextWindow && contextPct !== null && (
        <div className="flex items-center gap-2" title={`${formatTokens(totalTokens)} / ${formatTokens(contextWindow)} tokens used`}>
          <span className="text-text-muted">Context:</span>
          <div className="w-24 h-2 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                contextPct > 80 ? 'bg-error' : contextPct > 50 ? 'bg-warning' : 'bg-accent'
              }`}
              style={{ width: `${contextPct}%` }}
            />
          </div>
          <span>{contextPct.toFixed(0)}%</span>
        </div>
      )}

      {/* Right: Anthropic session usage */}
      {connected && session && isAnthropic && (
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Session:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-accent">{formatTokens(session?.inputTokens ?? 0)}</span>
            <span className="text-text-muted">in</span>
            <span className="text-success">{formatTokens(session?.outputTokens ?? 0)}</span>
            <span className="text-text-muted">out</span>
            <span className="text-text-muted">·</span>
            <span>{formatTokens(totalTokens)} total</span>
          </div>
        </div>
      )}

      {!connected && <span>Disconnected</span>}
    </footer>
  );
}
