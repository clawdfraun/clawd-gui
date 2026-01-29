import { useState, useEffect, useCallback } from 'react';
import { useGateway, useSessions, useAgents, useChatStream } from './hooks/useGateway';
import { ConnectionSettings } from './components/ConnectionSettings';
import { SessionList } from './components/SessionList';
import { ChatView } from './components/ChatView';
import { WorkingOnPane } from './components/WorkingOnPane';
import { WaitingForYouPane } from './components/WaitingForYouPane';
import { ThinkingControls } from './components/ThinkingControls';
import { AgentSelector } from './components/AgentSelector';
import { ThemeSwitcher, ContextBar, AnthropicUsage } from './components/StatusBar';

export default function App() {
  const { state, client, gatewayUrl, token, connect, disconnect } = useGateway();
  const connected = state === 'connected';
  const { sessions, loading: sessionsLoading, refresh: refreshSessions } = useSessions(client, connected);
  const { agents, loading: agentsLoading } = useAgents(client, connected);
  const { streamingMessages, agentEvents, activeRunIds, finishedRunIds, streamEndCounter, markRunActive, markRunInactive, clearFinishedStreams } = useChatStream(client);

  const [activeAgentId, setActiveAgentId] = useState(() => localStorage.getItem('clawd-gui-agent-id') || 'main');
  const [activeSessionKey, setActiveSessionKey] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState<boolean>(() => {
    return localStorage.getItem('clawd-gui-show-thinking') === 'true';
  });

  // When agents load, ensure activeAgentId is valid
  useEffect(() => {
    if (agents.length > 0) {
      const valid = agents.find(a => a.id === activeAgentId);
      if (!valid) {
        const def = agents.find(a => a.default) || agents[0];
        setActiveAgentId(def.id);
        localStorage.setItem('clawd-gui-agent-id', def.id);
      }
    }
  }, [agents, activeAgentId]);

  // Handle agent switch
  const handleAgentSwitch = useCallback((agentId: string) => {
    setActiveAgentId(agentId);
    localStorage.setItem('clawd-gui-agent-id', agentId);
    // Clear active session so it picks the right one for this agent
    setActiveSessionKey('');
  }, []);

  // Filter sessions for the active agent
  const agentSessions = sessions.filter(s => {
    // Match sessions that belong to the active agent
    return s.key.startsWith(`agent:${activeAgentId}:`);
  });

  // Set default session on connect
  useEffect(() => {
    if (connected && client?.sessionDefaults?.mainSessionKey && !activeSessionKey) {
      // Use main session key only if it matches the active agent
      const mainKey = client.sessionDefaults.mainSessionKey;
      if (mainKey.startsWith(`agent:${activeAgentId}:`)) {
        setActiveSessionKey(mainKey);
      }
    }
  }, [connected, client, activeSessionKey, activeAgentId]);

  // Also set from sessions list if no active key
  useEffect(() => {
    if (!activeSessionKey && agentSessions.length > 0) {
      const webchat = agentSessions.find(s => s.key.includes('webchat') || s.channel === 'webchat');
      setActiveSessionKey(webchat?.key || agentSessions[0].key);
    }
  }, [agentSessions, activeSessionKey]);

  // Periodic session refresh (every 5 minutes) to update derived titles
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      refreshSessions();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [connected, refreshSessions]);

  // Refresh sessions after each stream ends (to update token counts)
  useEffect(() => {
    if (streamEndCounter > 0) {
      setTimeout(refreshSessions, 500);
    }
  }, [streamEndCounter, refreshSessions]);

  // Create new session
  const handleNewSession = useCallback(async () => {
    if (!client) return;
    try {
      // Use chat.send to a new session key to create it
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

  // Load thinking level when session changes
  useEffect(() => {
    if (!activeSessionKey || !sessions.length) return;
    const session = sessions.find(s => s.key === activeSessionKey);
    setThinkingLevel(session?.thinkingLevel ?? 'auto');
  }, [activeSessionKey, sessions]);

  // Toggle show thinking
  const handleToggleShowThinking = useCallback(() => {
    setShowThinking(prev => {
      const next = !prev;
      localStorage.setItem('clawd-gui-show-thinking', String(next));
      return next;
    });
  }, []);

  // Cycle thinking level
  const handleCycleThinkingLevel = useCallback(async () => {
    if (!client || !activeSessionKey) return;

    const levels: (string | null)[] = [null, 'low', 'medium', 'high', 'auto'];
    const currentIdx = levels.indexOf(thinkingLevel);
    const nextLevel = levels[(currentIdx + 1) % levels.length];

    try {
      // For "auto", we store it locally but don't patch the gateway yet
      // (auto will patch per-message before sending)
      if (nextLevel !== 'auto') {
        await client.request('sessions.patch', {
          key: activeSessionKey,
          thinkingLevel: nextLevel,
        });
      }
      setThinkingLevel(nextLevel);
    } catch (err) {
      console.error('Failed to toggle thinking:', err);
    }
  }, [client, activeSessionKey, thinkingLevel]);

  const activeSession = sessions.find(s => s.key === activeSessionKey);

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-bg-secondary border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-accent">Clawd</span>
            <span className="text-text-secondary ml-1 font-normal text-sm">GUI</span>
          </h1>
          <ThemeSwitcher />
          {connected && agents.length > 1 && (
            <AgentSelector
              agents={agents}
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
          <ConnectionSettings
            state={state}
            gatewayUrl={gatewayUrl}
            token={token}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-72 bg-bg-secondary border-r border-border flex flex-col shrink-0">
          {connected && client && (
            <>
              <WorkingOnPane client={client} />
              <WaitingForYouPane />
              <div className="flex-1 min-h-0">
                <SessionList
                  sessions={agentSessions}
                  activeKey={activeSessionKey}
                  onSelect={setActiveSessionKey}
                  onRefresh={refreshSessions}
                  onNewSession={handleNewSession}
                  loading={sessionsLoading}
                  client={client}
                />
              </div>
            </>
          )}
          {!connected && (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              Not connected
            </div>
          )}
        </aside>

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
                  <span className="text-sm">Click the <span className="text-text-primary font-medium">status indicator</span> in the top-right corner to enter your Gateway URL and token.</span>
                </>
              )}
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
