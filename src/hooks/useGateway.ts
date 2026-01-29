import { useState, useEffect, useCallback, useRef } from 'react';
import { createGateway, getGateway, GatewayClient, ConnectionState } from '../lib/gateway';
import { EventFrame, SessionEntry, ChatEvent, AgentEvent } from '../types/gateway';

const LS_URL = 'clawd-gui-gateway-url';
const LS_TOKEN = 'clawd-gui-gateway-token';

export function useGateway() {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [client, setClient] = useState<GatewayClient | null>(null);
  const [gatewayUrl, setGatewayUrl] = useState(() => localStorage.getItem(LS_URL) || 'ws://127.0.0.1:18789');
  const [token, setToken] = useState(() => localStorage.getItem(LS_TOKEN) || '');

  const connect = useCallback((url: string, tok: string) => {
    localStorage.setItem(LS_URL, url);
    localStorage.setItem(LS_TOKEN, tok);
    setGatewayUrl(url);
    setToken(tok);

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

  // Auto-connect on mount if credentials exist
  useEffect(() => {
    if (token && gatewayUrl) {
      connect(gatewayUrl, token);
    }
    return () => { getGateway()?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, client, gatewayUrl, token, connect, disconnect };
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
  const handlersRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!client) return;

    const unsub = client.onEvent((evt: EventFrame) => {
      if (evt.event === 'chat') {
        const chatEvt = evt.payload as ChatEvent;
        const { runId, state: evtState } = chatEvt;

        if (evtState === 'delta') {
          setActiveRunIds(prev => new Set(prev).add(runId));
          // Extract text from message
          const msg = chatEvt.message;
          let text = '';
          if (typeof msg === 'string') {
            text = msg;
          } else if (Array.isArray(msg)) {
            text = msg
              .filter((b: Record<string, unknown>) => b.type === 'text')
              .map((b: Record<string, unknown>) => b.text || '')
              .join('');
          } else if (msg && typeof msg === 'object' && 'content' in msg) {
            const content = (msg as Record<string, unknown>).content;
            if (typeof content === 'string') text = content;
            else if (Array.isArray(content)) {
              text = content
                .filter((b: Record<string, unknown>) => b.type === 'text')
                .map((b: Record<string, unknown>) => b.text || '')
                .join('');
            }
          }
          if (text) {
            setStreamingMessages(prev => {
              const next = new Map(prev);
              next.set(runId, (next.get(runId) || '') + text);
              return next;
            });
          }
        } else if (evtState === 'final' || evtState === 'aborted' || evtState === 'error') {
          setActiveRunIds(prev => {
            const next = new Set(prev);
            next.delete(runId);
            return next;
          });
          // Clean up streaming message after small delay (let UI render final)
          setTimeout(() => {
            setStreamingMessages(prev => {
              const next = new Map(prev);
              next.delete(runId);
              return next;
            });
            setAgentEvents(prev => {
              const next = new Map(prev);
              next.delete(runId);
              return next;
            });
          }, 500);
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

  return { streamingMessages, agentEvents, activeRunIds };
}
