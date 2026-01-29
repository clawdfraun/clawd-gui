import { useState, useEffect, useCallback } from 'react';
import { SessionEntry } from '../types/gateway';

type ThemeMode = 'dark' | 'light' | 'system';

const THEME_KEY = 'clawd-gui-theme';

// Known model context windows
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
  if (MODEL_CONTEXT_WINDOWS[shortName]) return MODEL_CONTEXT_WINDOWS[shortName];
  for (const [key, val] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (shortName.startsWith(key) || shortName.includes(key)) return val;
  }
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

/* ── Theme Switcher ── */

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem(THEME_KEY) as ThemeMode) || 'dark';
  });

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

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
      title={`Theme: ${theme} (click to cycle)`}
    >
      <span>{themeIcon}</span>
      <span className="capitalize">{theme}</span>
    </button>
  );
}

/* ── Context Window Bar ── */

export function ContextBar({ session }: { session: SessionEntry }) {
  const model = session?.model;
  const totalTokens = session?.totalTokens ?? 0;
  const contextWindow = getContextWindow(model);
  if (!contextWindow) return null;

  const pct = Math.min(100, (totalTokens / contextWindow) * 100);

  return (
    <div
      className="flex items-center gap-1.5 text-[11px] text-text-muted"
      title={`Context: ${formatTokens(totalTokens)} / ${formatTokens(contextWindow)} tokens (${pct.toFixed(1)}%)`}
    >
      <span>Ctx</span>
      <div className="w-16 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct > 80 ? 'bg-error' : pct > 50 ? 'bg-warning' : 'bg-accent'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>{pct.toFixed(0)}%</span>
    </div>
  );
}

/* ── Anthropic Session Usage ── */

export function SessionUsage({ session }: { session: SessionEntry }) {
  if (!isAnthropicModel(session?.model)) return null;

  const input = session?.inputTokens ?? 0;
  const output = session?.outputTokens ?? 0;
  const total = session?.totalTokens ?? 0;

  return (
    <div className="flex items-center gap-1 text-[11px] text-text-muted" title={`Input: ${formatTokens(input)} · Output: ${formatTokens(output)} · Total: ${formatTokens(total)}`}>
      <span className="text-accent">{formatTokens(input)}</span>
      <span>↑</span>
      <span className="text-success">{formatTokens(output)}</span>
      <span>↓</span>
    </div>
  );
}
