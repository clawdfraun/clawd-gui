import { SessionEntry } from '../types/gateway';

interface Props {
  sessions: SessionEntry[];
  activeKey: string;
  onSelect: (key: string) => void;
  onRefresh: () => void;
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

export function SessionList({ sessions, activeKey, onSelect, onRefresh, loading }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-xs font-semibold uppercase text-text-secondary tracking-wider">Sessions</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          {loading ? '...' : '↻'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map(s => (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-bg-hover transition-colors ${
              s.key === activeKey ? 'bg-bg-tertiary border-l-2 border-l-accent' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate max-w-[180px]">
                {s.derivedTitle || s.label || s.key.split(':').pop()}
              </span>
              <span className="text-[10px] text-text-muted ml-2 shrink-0">
                {formatAge(s.lastActivityAt)}
              </span>
            </div>
            {s.lastMessage && (
              <p className="text-xs text-text-secondary mt-1 truncate">{s.lastMessage}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {s.model && <span className="text-[10px] text-text-muted">{s.model.split('/').pop()}</span>}
              {s.totalTokens && <span className="text-[10px] text-text-muted">{(s.totalTokens / 1000).toFixed(0)}k tok</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
