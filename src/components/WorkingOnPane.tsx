import { useEffect, useState, useCallback } from 'react';
import { GatewayClient } from '../lib/gateway';
import { SessionEntry, EventFrame } from '../types/gateway';

interface Props {
  client: GatewayClient;
}

interface ActiveSession {
  key: string;
  title: string;
  spawnedBy?: string;
  lastActivity?: string;
}

export function WorkingOnPane({ client }: Props) {
  const [active, setActive] = useState<ActiveSession[]>([]);

  const refresh = useCallback(async () => {
    try {
      const result = await client.request<{ sessions: SessionEntry[] }>('sessions.list', {
        activeMinutes: 5,
        includeDerivedTitles: true,
        limit: 20,
      });
      const sessions = (result.sessions || [])
        .filter(s => s.lastActivityAt && (Date.now() - new Date(s.lastActivityAt).getTime()) < 5 * 60 * 1000)
        .map(s => ({
          key: s.key,
          title: s.derivedTitle || s.label || s.key.split(':').pop() || s.key,
          spawnedBy: s.spawnedBy,
          lastActivity: s.lastActivityAt,
        }));
      setActive(sessions);
    } catch { /* ignore */ }
  }, [client]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);

    // Also refresh on agent events
    const unsub = client.onEvent((evt: EventFrame) => {
      if (evt.event === 'agent' || evt.event === 'chat') {
        refresh();
      }
    });

    return () => { clearInterval(interval); unsub(); };
  }, [client, refresh]);

  return (
    <div className="border-b border-border">
      <div className="px-3 py-2 border-b border-border">
        <h2 className="text-xs font-semibold uppercase text-text-secondary tracking-wider">Working On</h2>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {active.length === 0 ? (
          <p className="text-xs text-text-muted px-3 py-3">Nothing active</p>
        ) : (
          active.map(s => (
            <div key={s.key} className="px-3 py-2 border-b border-border/30">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shrink-0" />
                <span className="text-xs font-medium truncate">{s.title}</span>
              </div>
              {s.spawnedBy && (
                <span className="text-[10px] text-text-muted ml-3.5">↳ spawned by {s.spawnedBy.split(':').pop()}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
