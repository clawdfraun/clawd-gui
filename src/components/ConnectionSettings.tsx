import { useState } from 'react';
import { ConnectionState } from '../lib/gateway';

interface Props {
  state: ConnectionState;
  gatewayUrl: string;
  token: string;
  onConnect: (url: string, token: string) => void;
  onDisconnect: () => void;
}

export function ConnectionSettings({ state, gatewayUrl, token, onConnect, onDisconnect }: Props) {
  const [url, setUrl] = useState(gatewayUrl);
  const [tok, setTok] = useState(token);
  const [open, setOpen] = useState(false);

  const stateColors: Record<ConnectionState, string> = {
    connected: 'bg-success',
    connecting: 'bg-warning',
    disconnected: 'bg-text-muted',
    error: 'bg-error',
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-tertiary hover:bg-bg-hover transition-colors text-sm"
      >
        <span className={`w-2 h-2 rounded-full ${stateColors[state]}`} />
        <span className="capitalize">{state}</span>
        {(state === 'disconnected' || state === 'error') && (
          <span className="text-text-muted text-xs ml-1">— click to configure</span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-96 bg-bg-secondary border border-border rounded-lg p-4 shadow-xl z-50">
          <h3 className="text-sm font-semibold mb-3">Gateway Connection</h3>

          <label className="block text-xs text-text-secondary mb-1">Gateway URL</label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="ws://127.0.0.1:18789"
            className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent"
          />

          <label className="block text-xs text-text-secondary mb-1">Token</label>
          <input
            type="password"
            value={tok}
            onChange={e => setTok(e.target.value)}
            placeholder="Paste gateway token"
            className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent"
          />

          <div className="flex gap-2">
            <button
              onClick={() => { onConnect(url, tok); setOpen(false); }}
              className="px-4 py-2 bg-accent hover:bg-accent-hover rounded text-sm font-medium transition-colors"
            >
              Connect
            </button>
            {state !== 'disconnected' && (
              <button
                onClick={() => { onDisconnect(); setOpen(false); }}
                className="px-4 py-2 bg-bg-tertiary hover:bg-bg-hover rounded text-sm transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
