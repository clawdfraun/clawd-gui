import { useEffect, useState, useCallback } from 'react';
import { GatewayClient } from '../lib/gateway';
import { SessionEntry, EventFrame } from '../types/gateway';

interface Props {
  client: GatewayClient;
  allowedAgents?: string[];
}

interface ActiveSession {
  key: string;
  title: string;
  spawnedBy?: string;
  lastActivity?: string;
}

interface WorkingItem {
  id: string;
  text: string;
  status?: 'running' | 'waiting' | 'done';
  startedAt?: string;
}

const FILE_URL = `http://${window.location.hostname}:9089/file/working-on.json`;

export function WorkingOnPane({ client, allowedAgents = ['*'] }: Props) {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [items, setItems] = useState<WorkingItem[]>([]);

  // Fetch manual working-on items from file
  const fetchItems = useCallback(async () => {
    try {
      const response = await fetch(FILE_URL);
      if (response.ok) {
        const data = await response.json();
        setItems((data.items || []).filter((i: WorkingItem) => i.status !== 'done'));
      }
    } catch { /* file not available */ }
  }, []);

  // Fetch active sub-agent sessions
  const refreshSessions = useCallback(async () => {
    try {
      const result = await client.request<{ sessions: SessionEntry[] }>('sessions.list', {
        activeMinutes: 15,
        includeDerivedTitles: true,
        limit: 20,
      });
      const active = (result.sessions || [])
        .filter(s => s.lastActivityAt && (Date.now() - new Date(s.lastActivityAt).getTime()) < 15 * 60 * 1000)
        .filter(s => s.key !== 'agent:main:main') // exclude main session
        .filter(s => {
          if (allowedAgents.includes('*')) return true;
          const match = s.key.match(/^agent:([^:]+):/);
          return match ? allowedAgents.includes(match[1]) : false;
        })
        .map(s => ({
          key: s.key,
          title: s.derivedTitle || s.label || s.key.split(':').pop() || s.key,
          spawnedBy: s.spawnedBy,
          lastActivity: s.lastActivityAt,
        }));
      setSessions(active);
    } catch { /* ignore */ }
  }, [client]);

  useEffect(() => {
    fetchItems();
    refreshSessions();
    const itemInterval = setInterval(fetchItems, 30000);
    const sessionInterval = setInterval(refreshSessions, 15000);

    const unsub = client.onEvent((evt: EventFrame) => {
      if (evt.event === 'agent' || evt.event === 'chat') {
        refreshSessions();
      }
    });

    return () => { clearInterval(itemInterval); clearInterval(sessionInterval); unsub(); };
  }, [client, fetchItems, refreshSessions]);

  const hasContent = items.length > 0 || sessions.length > 0;

  const statusIcon: Record<string, string> = {
    running: '🔄',
    waiting: '⏳',
    done: '✅',
  };

  return (
    <div className="border-b border-border">
      <div className="px-3 py-2 border-b border-border">
        <h2 className="text-xs font-semibold uppercase text-text-secondary tracking-wider">Working On</h2>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {!hasContent ? (
          <p className="text-xs text-text-muted px-3 py-3">Nothing active</p>
        ) : (
          <>
            {items.map(item => (
              <div key={item.id} className="px-3 py-2 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs shrink-0">{statusIcon[item.status || 'running']}</span>
                  <span className="text-xs font-medium truncate">{item.text}</span>
                </div>
                {item.startedAt && (
                  <span className="text-[10px] text-text-muted ml-5">started {item.startedAt}</span>
                )}
              </div>
            ))}
            {sessions.map(s => (
              <div key={s.key} className="px-3 py-2 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shrink-0" />
                  <span className="text-xs font-medium truncate">{s.title}</span>
                </div>
                {s.spawnedBy && (
                  <span className="text-[10px] text-text-muted ml-3.5">↳ sub-agent</span>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
