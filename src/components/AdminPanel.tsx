import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

interface UserInfo {
  id: number;
  username: string;
  displayName: string | null;
  allowedAgents: string[];
  isAdmin: boolean;
  createdAt: string;
}

interface GatewaySettings {
  gatewayUrl: string;
  gatewayToken: string;
}

export function AdminPanel({ onClose, onGatewaySaved }: { onClose: () => void; onGatewaySaved?: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'users' | 'gateway'>('users');
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [gateway, setGateway] = useState<GatewaySettings>({ gatewayUrl: '', gatewayToken: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // New user form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newAgents, setNewAgents] = useState('*');

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: UserInfo[] }>('/users');
      setUsers(data.users);
    } catch { /* ignore */ }
  }, []);

  const loadGateway = useCallback(async () => {
    try {
      const data = await apiFetch<GatewaySettings>('/settings/gateway');
      setGateway(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadUsers();
    loadGateway();
  }, [loadUsers, loadGateway]);

  const handleSaveGateway = async () => {
    setSaving(true);
    try {
      await apiFetch('/settings/gateway', {
        method: 'PUT',
        body: JSON.stringify(gateway),
      });
      setMessage('Gateway settings saved — reconnecting...');
      setTimeout(() => setMessage(''), 2000);
      onGatewaySaved?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save');
    }
    setSaving(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const agents = newAgents.split(',').map(a => a.trim()).filter(Boolean);
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newDisplayName || null,
          isAdmin: newIsAdmin,
          allowedAgents: agents,
        }),
      });
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewIsAdmin(false);
      setNewAgents('*');
      loadUsers();
      setMessage('User created');
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    try {
      await apiFetch(`/users/${id}`, { method: 'DELETE' });
      loadUsers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleToggleAdmin = async (u: UserInfo) => {
    try {
      await apiFetch(`/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isAdmin: !u.isAdmin }),
      });
      loadUsers();
    } catch { /* ignore */ }
  };

  if (!user?.isAdmin) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-bg-secondary border border-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Admin Panel</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2 text-sm ${tab === 'users' ? 'border-b-2 border-accent text-accent' : 'text-text-secondary'}`}
          >
            Users
          </button>
          <button
            onClick={() => setTab('gateway')}
            className={`px-4 py-2 text-sm ${tab === 'gateway' ? 'border-b-2 border-accent text-accent' : 'text-text-secondary'}`}
          >
            Gateway
          </button>
        </div>

        {message && (
          <div className="px-4 py-2 bg-accent/10 text-accent text-xs">{message}</div>
        )}

        <div className="overflow-y-auto p-4 max-h-[60vh]">
          {tab === 'users' && (
            <div className="space-y-4">
              {/* Existing users */}
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-bg-primary rounded p-3 border border-border">
                    <div>
                      <span className="text-sm font-medium">{u.username}</span>
                      {u.displayName && <span className="text-xs text-text-muted ml-2">({u.displayName})</span>}
                      {u.isAdmin && <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded ml-2">admin</span>}
                      <div className="text-[10px] text-text-muted mt-1">
                        Agents: {u.allowedAgents.join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleAdmin(u)}
                        disabled={u.id === user.id}
                        className="text-[10px] text-text-muted hover:text-text-primary disabled:opacity-30"
                      >
                        {u.isAdmin ? 'Revoke admin' : 'Make admin'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        disabled={u.id === user.id}
                        className="text-[10px] text-error hover:text-error/80 disabled:opacity-30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add user form */}
              <form onSubmit={handleCreateUser} className="border border-border rounded p-3 space-y-2">
                <h3 className="text-xs font-semibold text-text-secondary">Add User</h3>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder="Username"
                    required
                    className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Password"
                    required
                    className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                  />
                  <input
                    value={newDisplayName}
                    onChange={e => setNewDisplayName(e.target.value)}
                    placeholder="Display name (optional)"
                    className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                  />
                  <input
                    value={newAgents}
                    onChange={e => setNewAgents(e.target.value)}
                    placeholder="Allowed agents (* = all)"
                    className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={newIsAdmin}
                      onChange={e => setNewIsAdmin(e.target.checked)}
                      className="rounded"
                    />
                    Admin
                  </label>
                  <button type="submit" className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-xs font-medium">
                    Create User
                  </button>
                </div>
              </form>
            </div>
          )}

          {tab === 'gateway' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Gateway WebSocket URL</label>
                <input
                  value={gateway.gatewayUrl}
                  onChange={e => setGateway(g => ({ ...g, gatewayUrl: e.target.value }))}
                  placeholder="ws://127.0.0.1:18789"
                  className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Gateway Token</label>
                <input
                  type="password"
                  value={gateway.gatewayToken}
                  onChange={e => setGateway(g => ({ ...g, gatewayToken: e.target.value }))}
                  placeholder="Paste gateway token"
                  className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <button
                onClick={handleSaveGateway}
                disabled={saving}
                className="px-4 py-2 bg-accent hover:bg-accent-hover rounded text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Gateway Settings'}
              </button>
              <p className="text-[10px] text-text-muted">
                These settings are shared across all users. The frontend connects directly to this gateway for real-time chat.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
