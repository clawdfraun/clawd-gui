import { useState, useEffect, useCallback } from 'react';
import { useGateway, useSessions, useAgents, useChatStream } from './hooks/useGateway';
import { useAuth } from './hooks/useAuth';
import { apiFetch } from './lib/api';
import { SessionList } from './components/SessionList';
import { ChatView } from './components/ChatView';
import { WorkingOnPane } from './components/WorkingOnPane';
import { WaitingForYouPane } from './components/WaitingForYouPane';
import { ThinkingControls } from './components/ThinkingControls';
import { AgentSelector } from './components/AgentSelector';
import { AdminPanel } from './components/AdminPanel';
import { ThemeSwitcher, ContextBar, AnthropicUsage } from './components/StatusBar';

export default function App() {
  const { user, logout } = useAuth();
  const { state, client, connect, disconnect } = useGateway();
  const connected = state === 'connected';
  const { sessions, loading: sessionsLoading, refresh: refreshSessions } = useSessions(client, connected);
  const { agents, loading: agentsLoading } = useAgents(client, connected);
  const { streamingMessages, agentEvents, activeRunIds, finishedRunIds, streamEndCounter, markRunActive, markRunInactive, clearFinishedStreams } = useChatStream(client);

  const [activeAgentId, setActiveAgentId] = useState(() => localStorage.getItem('clawd-gui-agent-id') || 'main');
  const [activeSessionKey, setActiveSessionKey] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState<string | null>(() => {
    return localStorage.getItem('clawd-gui-thinking-level') || 'auto';
  });
  const [autoResolvedLevel, setAutoResolvedLevel] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState<boolean>(() => {
    return localStorage.getItem('clawd-gui-show-thinking') === 'true';
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem('clawd-gui-sidebar-open');
    if (stored !== null) return stored === 'true';
    return window.innerWidth >= 768;
  });
  const [showAdmin, setShowAdmin] = useState(false);
  const [gatewayLoaded, setGatewayLoaded] = useState(false);

  // Load gateway settings and connect
  const reconnectGateway = useCallback(async () => {
    disconnect();
    try {
      const data = await apiFetch<{ gatewayUrl: string; gatewayToken: string }>('/settings/gateway');
      if (data.gatewayUrl && data.gatewayToken) {
        connect(data.gatewayUrl, data.gatewayToken);
      }
    } catch { /* ignore */ }
    setGatewayLoaded(true);
  }, [connect, disconnect]);

  // Auto-connect when user logs in (keyed on user id)
  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      disconnect();
      setGatewayLoaded(false);
      return;
    }
    // Small delay to ensure state is settled after login
    const t = setTimeout(() => {
      apiFetch<{ gatewayUrl: string; gatewayToken: string }>('/settings/gateway')
        .then(data => {
          if (data.gatewayUrl && data.gatewayToken) {
            connect(data.gatewayUrl, data.gatewayToken);
          }
          setGatewayLoaded(true);
        })
        .catch(() => setGatewayLoaded(true));
    }, 100);
    return () => { clearTimeout(t); disconnect(); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter agents by user's allowed_agents
  const allowedAgents = user?.allowedAgents || [];
  const filteredAgents = agents.filter(a => {
    if (allowedAgents.includes('*')) return true;
    return allowedAgents.includes(a.id);
  });

  // When agents load, ensure activeAgentId is valid
  useEffect(() => {
    if (filteredAgents.length > 0) {
      const valid = filteredAgents.find(a => a.id === activeAgentId);
      if (!valid) {
        const def = filteredAgents.find(a => a.default) || filteredAgents[0];
        setActiveAgentId(def.id);
        localStorage.setItem('clawd-gui-agent-id', def.id);
      }
    }
  }, [filteredAgents, activeAgentId]);

  const handleAgentSwitch = useCallback((agentId: string) => {
    setActiveAgentId(agentId);
    localStorage.setItem('clawd-gui-agent-id', agentId);
    setActiveSessionKey('');
  }, []);

  // Filter sessions for active agent AND allowed agents
  const agentSessions = sessions.filter(s => {
    if (!s.key.startsWith(`agent:${activeAgentId}:`)) return false;
    // Also filter by allowed agents
    if (allowedAgents.includes('*')) return true;
    const match = s.key.match(/^agent:([^:]+):/);
    return match ? allowedAgents.includes(match[1]) : false;
  });

  // Set default session on connect
  useEffect(() => {
    if (connected && client?.sessionDefaults?.mainSessionKey && !activeSessionKey) {
      const mainKey = client.sessionDefaults.mainSessionKey;
      if (mainKey.startsWith(`agent:${activeAgentId}:`)) {
        setActiveSessionKey(mainKey);
      }
    }
  }, [connected, client, activeSessionKey, activeAgentId]);

  useEffect(() => {
    if (!activeSessionKey && agentSessions.length > 0) {
      const webchat = agentSessions.find(s => s.key.includes('webchat') || s.channel === 'webchat');
      setActiveSessionKey(webchat?.key || agentSessions[0].key);
    }
  }, [agentSessions, activeSessionKey]);

  // Periodic session refresh
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => { refreshSessions(); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [connected, refreshSessions]);

  // Refresh sessions after stream ends
  useEffect(() => {
    if (streamEndCounter > 0) {
      setTimeout(refreshSessions, 500);
    }
  }, [streamEndCounter, refreshSessions]);

  const handleNewSession = useCallback(async () => {
    if (!client) return;
    try {
      const sessionKey = `agent:${activeAgentId}:webchat:${Date.now()}`;
      await client.request('chat.send', {
        sessionKey,
        message: '/new',
        idempotencyKey: `new-${Date.now()}`,
      });
      setActiveSessionKey(sessionKey);
      setTimeout(refreshSessions, 1000);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  }, [client, refreshSessions, activeAgentId]);

  useEffect(() => {
    if (!activeSessionKey || !sessions.length) return;
    const stored = localStorage.getItem('clawd-gui-thinking-level');
    if (stored === 'auto') {
      setThinkingLevel('auto');
    } else if (stored) {
      setThinkingLevel(stored);
    } else {
      const session = sessions.find(s => s.key === activeSessionKey);
      setThinkingLevel(session?.thinkingLevel ?? 'auto');
    }
  }, [activeSessionKey, sessions]);

  const handleToggleShowThinking = useCallback(() => {
    setShowThinking(prev => {
      const next = !prev;
      localStorage.setItem('clawd-gui-show-thinking', String(next));
      return next;
    });
  }, []);

  const handleCycleThinkingLevel = useCallback(async () => {
    if (!client || !activeSessionKey) return;
    const levels: (string | null)[] = [null, 'low', 'medium', 'high', 'auto'];
    const currentIdx = levels.indexOf(thinkingLevel);
    const nextLevel = levels[(currentIdx + 1) % levels.length];
    try {
      if (nextLevel !== 'auto') {
        await client.request('sessions.patch', {
          key: activeSessionKey,
          thinkingLevel: nextLevel,
        });
      }
      setThinkingLevel(nextLevel);
      localStorage.setItem('clawd-gui-thinking-level', nextLevel ?? 'off');
    } catch (err) {
      console.error('Failed to toggle thinking:', err);
    }
  }, [client, activeSessionKey, thinkingLevel]);

  const activeSession = sessions.find(s => s.key === activeSessionKey);

  return (
    <div className="h-screen flex flex-col bg-bg-primary" style={{ height: '100dvh' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-bg-secondary border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(prev => {
              const next = !prev;
              localStorage.setItem('clawd-gui-sidebar-open', String(next));
              return next;
            })}
            className="p-1.5 rounded hover:bg-bg-primary text-text-secondary hover:text-text-primary transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarOpen ? (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-accent">OpenClaw</span>
            <span className="text-text-secondary ml-1 font-normal text-sm">GUI</span>
          </h1>
          <ThemeSwitcher />
          {connected && filteredAgents.length > 1 && (
            <AgentSelector
              agents={filteredAgents}
              activeAgentId={activeAgentId}
              onSelect={handleAgentSwitch}
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          {connected && client && activeSession && (
            <>
              <ContextBar session={activeSession} />
              <AnthropicUsage session={activeSession} />
            </>
          )}
          {connected && client && activeSessionKey && (
            <ThinkingControls
              showThinking={showThinking}
              thinkingLevel={thinkingLevel}
              autoResolvedLevel={autoResolvedLevel}
              onToggleShow={handleToggleShowThinking}
              onCycleLevel={handleCycleThinkingLevel}
            />
          )}
          {connected && client?.helloOk && (
            <span className="text-xs text-text-muted">
              v{client.helloOk.server.version}
              {client.helloOk.server.host && ` • ${client.helloOk.server.host}`}
              {(() => {
                const model = activeSession?.model?.split('/').pop();
                return model ? ` • ${model}` : '';
              })()}
            </span>
          )}
          {/* Connection status indicator */}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              state === 'connected' ? 'bg-success' :
              state === 'connecting' ? 'bg-warning' :
              state === 'error' ? 'bg-error' : 'bg-text-muted'
            }`} title={state} />
          </div>
          {/* User menu */}
          <div className="flex items-center gap-2">
            {user?.isAdmin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
                title="Admin Panel"
              >
                ⚙️
              </button>
            )}
            <span className="text-xs text-text-secondary">{user?.displayName || user?.username}</span>
            <button
              onClick={logout}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
              title="Sign out"
            >
              ↪
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {sidebarOpen && <aside className="w-72 bg-bg-secondary border-r border-border flex flex-col shrink-0">
          {connected && client && (
            <>
              <WorkingOnPane client={client} />
              <WaitingForYouPane />
              <div className="flex-1 min-h-0">
                <SessionList
                  sessions={agentSessions}
                  activeKey={activeSessionKey}
                  onSelect={(key: string) => {
                    setActiveSessionKey(key);
                    if (window.innerWidth < 768) {
                      setSidebarOpen(false);
                      localStorage.setItem('clawd-gui-sidebar-open', 'false');
                    }
                  }}
                  onRefresh={refreshSessions}
                  onNewSession={handleNewSession}
                  loading={sessionsLoading}
                  client={client}
                />
              </div>
            </>
          )}
          {!connected && (
            <div className="flex flex-col items-center justify-center h-full text-text-muted text-sm gap-2 px-4 text-center">
              {gatewayLoaded ? (
                user?.isAdmin ? (
                  <>
                    <span>Gateway not configured</span>
                    <button onClick={() => setShowAdmin(true)} className="text-accent hover:text-accent-hover text-xs">
                      Open Admin Panel to configure
                    </button>
                  </>
                ) : (
                  <span>Not connected — ask an admin to configure the gateway</span>
                )
              ) : (
                <span>Connecting...</span>
              )}
            </div>
          )}
        </aside>}

        {/* Chat area */}
        <main className="flex-1 min-w-0">
          {connected && client && activeSessionKey ? (
            <ChatView
              client={client}
              sessionKey={activeSessionKey}
              streamingMessages={streamingMessages}
              agentEvents={agentEvents}
              activeRunIds={activeRunIds}
              showThinking={showThinking}
              thinkingLevel={thinkingLevel}
              onAutoResolvedLevel={setAutoResolvedLevel}
              streamEndCounter={streamEndCounter}
              onMarkRunActive={markRunActive}
              onMarkRunInactive={markRunInactive}
              finishedRunIds={finishedRunIds}
              onClearFinishedStreams={clearFinishedStreams}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3">
              {connected ? (
                <span>Select a session to start chatting</span>
              ) : (
                <>
                  <span className="text-lg">Not connected to the gateway</span>
                  {user?.isAdmin ? (
                    <button onClick={() => setShowAdmin(true)} className="text-sm text-accent hover:text-accent-hover">
                      Configure gateway settings →
                    </button>
                  ) : (
                    <span className="text-sm">Ask an admin to configure the gateway connection.</span>
                  )}
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} onGatewaySaved={reconnectGateway} />}
    </div>
  );
}
