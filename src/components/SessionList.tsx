import { useState } from 'react';
import { SessionEntry } from '../types/gateway';
import { GatewayClient } from '../lib/gateway';

interface Props {
  sessions: SessionEntry[];
  activeKey: string;
  onSelect: (key: string) => void;
  onRefresh: () => void;
  onNewSession: () => void;
  loading: boolean;
  client: GatewayClient | null;
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

function extractSessionId(key: string): string {
  // Extract the last part of the key for display
  const parts = key.split(':');
  const last = parts[parts.length - 1];
  // If it looks like a timestamp, format it
  if (/^\d{13}$/.test(last)) {
    const d = new Date(parseInt(last));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (last === 'main') return 'Main Session';
  return last;
}

function extractAgentId(key: string): string | null {
  const match = key.match(/^agent:([^:]+):/);
  return match ? match[1] : null;
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

export function SessionList({ sessions, activeKey, onSelect, onRefresh, onNewSession, loading, client }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const sorted = [...sessions].sort((a, b) => {
    if (a.key === activeKey) return -1;
    if (b.key === activeKey) return 1;
    const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return bTime - aTime;
  });

  const handleStartEdit = (s: SessionEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingKey(s.key);
    setEditValue(s.label || '');
  };

  const handleSaveLabel = async (key: string) => {
    if (!client) return;
    try {
      await client.request('sessions.patch', {
        key,
        label: editValue.trim() || null,
      });
      setEditingKey(null);
      onRefresh();
    } catch (err) {
      console.error('Failed to save label:', err);
    }
  };

  const handleDelete = async (key: string) => {
    if (!client) return;
    try {
      await client.request('sessions.delete', { key });
      setDeletingKey(null);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

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
        {sorted.map(s => {
          const agentId = extractAgentId(s.key);
          const displayName = s.label || extractSessionId(s.key);
          const isEditing = editingKey === s.key;
          const isDeleting = deletingKey === s.key;

          return (
            <div
              key={s.key}
              onClick={() => onSelect(s.key)}
              className={`relative w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-bg-hover transition-colors cursor-pointer group ${
                s.key === activeKey ? 'bg-bg-tertiary border-l-2 border-l-accent' : ''
              }`}
            >
              {/* Delete confirmation overlay */}
              {isDeleting && (
                <div className="absolute inset-0 bg-bg-secondary/95 flex items-center justify-center gap-2 z-10 px-2">
                  <span className="text-xs text-text-secondary">Delete?</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.key); }}
                    className="text-xs px-2 py-1 bg-error/20 text-error rounded hover:bg-error/30"
                  >
                    Yes
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingKey(null); }}
                    className="text-xs px-2 py-1 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-hover"
                  >
                    No
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between">
                {isEditing ? (
                  <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveLabel(s.key);
                        if (e.key === 'Escape') setEditingKey(null);
                      }}
                      autoFocus
                      placeholder="Session label..."
                      className="text-sm bg-bg-primary border border-border rounded px-1.5 py-0.5 flex-1 focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => handleSaveLabel(s.key)}
                      className="text-xs text-accent hover:text-accent-hover"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingKey(null)}
                      className="text-xs text-text-muted hover:text-text-primary"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      className="text-sm font-medium truncate max-w-[180px] cursor-pointer"
                      onClick={(e) => handleStartEdit(s, e)}
                      title="Click to rename"
                    >
                      {getSessionIcon(s)} {displayName}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-text-muted shrink-0">
                        {formatAge(s.lastActivityAt)}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingKey(s.key); }}
                        className="text-[10px] text-text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete session"
                      >
                        ✕
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 pl-5 flex-wrap">
                {agentId && (
                  <span className="text-[10px] text-accent/70">{agentId}</span>
                )}
                {s.model && <span className="text-[10px] text-text-muted">{s.model.split('/').pop()}</span>}
                {s.totalTokens != null && s.totalTokens > 0 && (
                  <span className="text-[10px] text-text-muted">{(s.totalTokens / 1000).toFixed(0)}k tok</span>
                )}
                {s.thinkingLevel && s.thinkingLevel !== 'off' && (
                  <span className="text-[10px] text-accent">🧠 {s.thinkingLevel}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
