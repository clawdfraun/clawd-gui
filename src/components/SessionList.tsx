import { SessionEntry } from '../types/gateway';

interface Props {
  sessions: SessionEntry[];
  activeKey: string;
  onSelect: (key: string) => void;
  onRefresh: () => void;
  onNewSession: () => void;
  loading: boolean;
}

function formatAge(dateStr?: string) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function deriveSessionName(s: SessionEntry): string {
  if (s.derivedTitle) return s.derivedTitle;
  if (s.label) return s.label;

  if (s.lastMessage) {
    const msg = s.lastMessage.trim();
    const firstLine = msg.split('\n')[0];
    if (firstLine.length > 40) return firstLine.slice(0, 37) + '...';
    return firstLine;
  }

  const key = s.key;
  if (key.includes(':main:main')) return 'Main Session';
  if (key.includes(':cron:')) return 'Cron Job';
  if (key.includes(':subagent:')) return 'Sub-agent';
  if (key.includes(':webchat:')) return 'Webchat';

  const parts = key.split(':');
  return parts[parts.length - 1];
}

function getSessionIcon(s: SessionEntry): string {
  const key = s.key;
  if (key.includes(':main:main')) return '💬';
  if (key.includes(':cron:')) return '⏰';
  if (key.includes(':subagent:')) return '🔧';
  if (s.channel === 'telegram') return '✈️';
  if (s.channel === 'discord') return '🎮';
  if (s.channel === 'webchat') return '🌐';
  return '💭';
}

export function SessionList({ sessions, activeKey, onSelect, onRefresh, onNewSession, loading }: Props) {
  const sorted = [...sessions].sort((a, b) => {
    if (a.key === activeKey) return -1;
    if (b.key === activeKey) return 1;
    const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-xs font-semibold uppercase text-text-secondary tracking-wider">Sessions</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewSession}
            className="text-xs text-accent hover:text-accent-hover transition-colors font-medium"
            title="Create new session"
          >
            + New
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
            title="Refresh sessions"
          >
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.map(s => (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-bg-hover transition-colors ${
              s.key === activeKey ? 'bg-bg-tertiary border-l-2 border-l-accent' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate max-w-[180px]">
                {getSessionIcon(s)} {deriveSessionName(s)}
              </span>
              <span className="text-[10px] text-text-muted ml-2 shrink-0">
                {formatAge(s.lastActivityAt)}
              </span>
            </div>
            {s.lastMessage && (
              <p className="text-xs text-text-secondary mt-1 truncate pl-5">{s.lastMessage}</p>
            )}
            <div className="flex items-center gap-2 mt-1 pl-5">
              {s.model && <span className="text-[10px] text-text-muted">{s.model.split('/').pop()}</span>}
              {s.totalTokens != null && s.totalTokens > 0 && (
                <span className="text-[10px] text-text-muted">{(s.totalTokens / 1000).toFixed(0)}k tok</span>
              )}
              {s.thinkingLevel && s.thinkingLevel !== 'off' && (
                <span className="text-[10px] text-accent">🧠 {s.thinkingLevel}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
