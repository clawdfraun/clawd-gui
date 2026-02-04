import { useState, useEffect } from 'react';
import { GatewayClient, ConnectionHealth as HealthType } from '../lib/gateway';

interface Props {
  client: GatewayClient | null;
  state: string;
}

export function ConnectionHealth({ client, state }: Props) {
  const [health, setHealth] = useState<HealthType | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!client) {
      setHealth(null);
      return;
    }

    // Get initial health
    setHealth(client.health);

    // Subscribe to health updates
    const unsub = client.onHealthChange(setHealth);
    return unsub;
  }, [client]);

  const getStatusColor = () => {
    if (state === 'connected' && !health?.isStale) return 'bg-success';
    if (state === 'connecting') return 'bg-warning animate-pulse';
    if (state === 'error' || health?.isStale) return 'bg-error animate-pulse';
    return 'bg-text-muted';
  };

  const getStatusText = () => {
    if (state === 'connected' && !health?.isStale) return 'Connected';
    if (state === 'connecting') return 'Connecting...';
    if (health?.isStale) return 'Stale - Reconnecting...';
    if (state === 'error') return 'Connection Error';
    return 'Disconnected';
  };

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const lastTickAgo = health?.lastTickAt != null
    ? Date.now() - health.lastTickAt 
    : null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-primary transition-colors"
        title={getStatusText()}
      >
        <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
        {(health?.reconnectAttempts ?? 0) > 0 && state !== 'connected' && (
          <span className="text-xs text-text-muted">
            retry #{health?.reconnectAttempts}
          </span>
        )}
      </button>

      {showDetails && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 p-3 bg-bg-secondary border border-border rounded-lg shadow-lg text-xs">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-text-muted">Status:</span>
              <span className={health?.isStale ? 'text-error' : state === 'connected' ? 'text-success' : 'text-warning'}>
                {getStatusText()}
              </span>
            </div>
            
            {health?.tickIntervalMs && (
              <div className="flex justify-between">
                <span className="text-text-muted">Expected tick:</span>
                <span className="text-text-primary">{formatMs(health.tickIntervalMs)}</span>
              </div>
            )}
            
            {lastTickAgo !== null && (
              <div className="flex justify-between">
                <span className="text-text-muted">Last tick:</span>
                <span className={lastTickAgo > (health?.tickIntervalMs || 0) * 2 ? 'text-error' : 'text-text-primary'}>
                  {formatMs(lastTickAgo)} ago
                </span>
              </div>
            )}

            {(health?.reconnectAttempts ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-text-muted">Reconnect attempts:</span>
                <span className="text-warning">{health?.reconnectAttempts}</span>
              </div>
            )}

            {client && state === 'connected' && health?.isStale && (
              <button
                onClick={() => {
                  client.forceReconnect();
                  setShowDetails(false);
                }}
                className="w-full mt-2 px-3 py-1.5 bg-accent text-white rounded hover:bg-accent-hover transition-colors"
              >
                Force Reconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
