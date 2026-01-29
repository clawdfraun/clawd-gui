import { useState, useEffect, useCallback } from 'react';
import { GatewayClient } from '../lib/gateway';
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

function formatTimeUntil(resetAt: number): string {
  const diff = resetAt - Date.now();
  if (diff <= 0) return 'now';
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
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
      <span>Context</span>
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

/* ── Anthropic Provider Usage ── */

interface UsageWindow {
  label: string;
  usedPercent: number;
  resetAt?: number;
}

interface ProviderUsage {
  provider: string;
  displayName: string;
  windows: UsageWindow[];
  error?: string;
}

interface UsageStatus {
  updatedAt: number;
  providers: ProviderUsage[];
}

export function AnthropicUsage({ client, session }: { client: GatewayClient; session: SessionEntry }) {
  const [usage, setUsage] = useState<ProviderUsage | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!client || client.state !== 'connected') return;
    setLoading(true);
    try {
      const result = await client.request<UsageStatus>('usage.status', {});
      const anthropic = result.providers?.find(p => p.provider === 'anthropic');
      setUsage(anthropic ?? null);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [client]);

  // Fetch on mount and after each stream ends (session changes trigger re-render)
  useEffect(() => {
    fetchUsage();
  }, [fetchUsage, session?.totalTokens]);

  // Refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(fetchUsage, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  if (!isAnthropicModel(session?.model)) return null;
  if (loading && !usage) return <span className="text-[11px] text-text-muted">⏳</span>;
  if (!usage || usage.windows.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-[11px] text-text-muted">
      {usage.windows.map((w, i) => (
        <div
          key={i}
          className="flex items-center gap-1"
          title={`${w.label}: ${w.usedPercent.toFixed(1)}% used${w.resetAt ? ` · resets in ${formatTimeUntil(w.resetAt)}` : ''}`}
        >
          <span>{w.label}</span>
          <div className="w-12 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                w.usedPercent > 80 ? 'bg-error' : w.usedPercent > 50 ? 'bg-warning' : 'bg-success'
              }`}
              style={{ width: `${Math.max(1, w.usedPercent)}%` }}
            />
          </div>
          <span>{w.usedPercent.toFixed(0)}%</span>
          {w.resetAt && (
            <span className="text-text-muted">({formatTimeUntil(w.resetAt)})</span>
          )}
        </div>
      ))}
    </div>
  );
}
