import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function LoginScreen() {
  const { login, setup, needsSetup } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (needsSetup) {
        await setup(username, password, displayName || undefined);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="text-accent">OpenClaw</span>
            <span className="text-text-secondary ml-1 font-normal text-lg">GUI</span>
          </h1>
          <p className="text-text-muted text-sm mt-2">
            {needsSetup ? 'Create your admin account to get started' : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-bg-secondary border border-border rounded-lg p-6 space-y-4">
          {needsSetup && (
            <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 mb-2">
              <p className="text-xs text-accent font-medium">First-time setup</p>
              <p className="text-xs text-text-secondary mt-1">This account will have admin privileges.</p>
            </div>
          )}

          <div>
            <label className="block text-xs text-text-secondary mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
              autoFocus
              required
            />
          </div>

          {needsSetup && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Display Name <span className="text-text-muted">(optional)</span></label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-text-secondary mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 bg-accent hover:bg-accent-hover rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? '...' : needsSetup ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
