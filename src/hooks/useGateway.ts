import { useState, useEffect, useCallback, useRef } from 'react';
import { createGateway, getGateway, GatewayClient, ConnectionState } from '../lib/gateway';
import { EventFrame, SessionEntry, ChatEvent, AgentEvent } from '../types/gateway';

export function useGateway() {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [client, setClient] = useState<GatewayClient | null>(null);

  const connect = useCallback((url: string, tok: string) => {
    const gw = createGateway(url, tok);
    gw.onStateChange(setState);
    gw.start();
    setClient(gw);
  }, []);

  const disconnect = useCallback(() => {
    getGateway()?.stop();
    setClient(null);
    setState('disconnected');
  }, []);

  return { state, client, connect, disconnect };
}

export interface AgentInfo {
  id: string;
  name?: string;
  default?: boolean;
  model?: string;
}

export function useAgents(client: GatewayClient | null, connected: boolean) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!client || client.state !== 'connected') return;
    setLoading(true);
    try {
      const result = await client.request<{ agents: AgentInfo[] }>('agents.list', {});
      setAgents(result.agents || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    if (connected) refresh();
  }, [connected, refresh]);

  return { agents, loading, refresh };
}

export function useSessions(client: GatewayClient | null, connected: boolean) {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!client || client.state !== 'connected') return;
    setLoading(true);
    try {
      const result = await client.request<{ sessions: SessionEntry[] }>('sessions.list', {
        limit: 100,
        includeDerivedTitles: true,
        includeLastMessage: true,
      });
      setSessions(result.sessions || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    if (connected) refresh();
  }, [connected, refresh]);

  return { sessions, loading, refresh };
}

export function useChatStream(client: GatewayClient | null) {
  const [streamingMessages, setStreamingMessages] = useState<Map<string, string>>(new Map());
  const [agentEvents, setAgentEvents] = useState<Map<string, AgentEvent[]>>(new Map());
  const [activeRunIds, setActiveRunIds] = useState<Set<string>>(new Set());
  const [finishedRunIds, setFinishedRunIds] = useState<Set<string>>(new Set());
  // Incremented when a stream ends, so consumers can react
  const [streamEndCounter, setStreamEndCounter] = useState(0);
  const handlersRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!client) return;

    const unsub = client.onEvent((evt: EventFrame) => {
      if (evt.event === 'chat') {
        const chatEvt = evt.payload as ChatEvent;
        const { runId, state: evtState } = chatEvt;

        if (evtState === 'delta') {
          setActiveRunIds(prev => new Set(prev).add(runId));
          // Extract text from the delta message.
          // Delta messages contain the FULL accumulated assistant message so far,
          // not just the new characters. We always replace, never append.
          const msg = chatEvt.message;
          let text = '';
          if (typeof msg === 'string') {
            text = msg;
          } else if (Array.isArray(msg)) {
            text = msg
              .filter((b: Record<string, unknown>) => b.type === 'text')
              .map((b: Record<string, unknown>) => b.text || '')
              .join('');
          } else if (msg && typeof msg === 'object') {
            const obj = msg as Record<string, unknown>;
            const content = obj.content;
            if (typeof content === 'string') {
              text = content;
            } else if (Array.isArray(content)) {
              text = content
                .filter((b: Record<string, unknown>) => b.type === 'text')
                .map((b: Record<string, unknown>) => b.text || '')
                .join('');
            }
          }
          if (text) {
            setStreamingMessages(prev => {
              const next = new Map(prev);
              // Always replace — deltas are cumulative, not incremental
              next.set(runId, text);
              return next;
            });
          }
        } else if (evtState === 'final' || evtState === 'aborted' || evtState === 'error') {
          setActiveRunIds(prev => {
            const next = new Set(prev);
            next.delete(runId);
            return next;
          });
          setAgentEvents(prev => {
            const next = new Map(prev);
            next.delete(runId);
            return next;
          });
          // Mark this run as finished — ChatView will clear streaming text
          // after history reloads to avoid flash
          setFinishedRunIds(prev => new Set(prev).add(runId));
          // Signal stream ended so ChatView reloads history
          setStreamEndCounter(c => c + 1);
        }
      } else if (evt.event === 'agent') {
        const agentEvt = evt.payload as AgentEvent;
        setAgentEvents(prev => {
          const next = new Map(prev);
          const existing = next.get(agentEvt.runId) || [];
          next.set(agentEvt.runId, [...existing, agentEvt]);
          return next;
        });
      }
    });

    handlersRef.current.push(unsub);
    return () => {
      handlersRef.current.forEach(fn => fn());
      handlersRef.current = [];
    };
  }, [client]);

  const markRunActive = useCallback((runId: string) => {
    setActiveRunIds(prev => new Set(prev).add(runId));
  }, []);

  const markRunInactive = useCallback((runId: string) => {
    setActiveRunIds(prev => {
      const next = new Set(prev);
      next.delete(runId);
      return next;
    });
  }, []);

  // Called by ChatView after history has loaded to clean up finished streaming messages
  const clearFinishedStreams = useCallback(() => {
    setFinishedRunIds(prev => {
      if (prev.size === 0) return prev;
      setStreamingMessages(sm => {
        const next = new Map(sm);
        prev.forEach(id => next.delete(id));
        return next;
      });
      return new Set();
    });
  }, []);

  return { streamingMessages, agentEvents, activeRunIds, finishedRunIds, streamEndCounter, markRunActive, markRunInactive, clearFinishedStreams };
}
