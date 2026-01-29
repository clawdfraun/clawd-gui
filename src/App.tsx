import { useState, useEffect } from 'react';
import { useGateway, useSessions, useChatStream } from './hooks/useGateway';
import { ConnectionSettings } from './components/ConnectionSettings';
import { SessionList } from './components/SessionList';
import { ChatView } from './components/ChatView';
import { WorkingOnPane } from './components/WorkingOnPane';
import { WaitingForYouPane } from './components/WaitingForYouPane';

export default function App() {
  const { state, client, gatewayUrl, token, connect, disconnect } = useGateway();
  const connected = state === 'connected';
  const { sessions, loading: sessionsLoading, refresh: refreshSessions } = useSessions(client, connected);
  const { streamingMessages, agentEvents, activeRunIds } = useChatStream(client);

  const [activeSessionKey, setActiveSessionKey] = useState('');

  // Set default session on connect
  useEffect(() => {
    if (connected && client?.sessionDefaults?.mainSessionKey && !activeSessionKey) {
      setActiveSessionKey(client.sessionDefaults.mainSessionKey);
    }
  }, [connected, client, activeSessionKey]);

  // Also set from sessions list if no active key
  useEffect(() => {
    if (!activeSessionKey && sessions.length > 0) {
      // Prefer webchat main session
      const webchat = sessions.find(s => s.key.includes('webchat') || s.channel === 'webchat');
      setActiveSessionKey(webchat?.key || sessions[0].key);
    }
  }, [sessions, activeSessionKey]);

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-bg-secondary border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-accent">Clawd</span>
            <span className="text-text-secondary ml-1 font-normal text-sm">GUI</span>
          </h1>
          {connected && activeSessionKey && (
            <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-1 rounded font-mono">
              {activeSessionKey}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {connected && client?.helloOk && (
            <span className="text-xs text-text-muted">
              v{client.helloOk.server.version}
              {client.helloOk.server.host && ` • ${client.helloOk.server.host}`}
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
                  sessions={sessions}
                  activeKey={activeSessionKey}
                  onSelect={setActiveSessionKey}
                  onRefresh={refreshSessions}
                  loading={sessionsLoading}
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
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted">
              {connected ? 'Select a session to start chatting' : 'Connect to the gateway to get started'}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
