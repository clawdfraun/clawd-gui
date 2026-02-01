import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiFetch, setToken as storeToken, clearToken } from '../lib/api';

export interface User {
  id: number;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  allowedAgents: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<User>('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  // Check auth status on mount
  useEffect(() => {
    const init = async () => {
      try {
        const status = await apiFetch<{ needsSetup: boolean }>('/auth/status');
        if (status.needsSetup) {
          setNeedsSetup(true);
          setLoading(false);
          return;
        }

        const token = localStorage.getItem('clawd-gui-jwt');
        if (token) {
          await refreshUser();
        }
      } catch {
        // Server might not be available
      }
      setLoading(false);
    };
    init();
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    storeToken(data.token);
    setUser(data.user);
    setNeedsSetup(false);
  }, []);

  const setup = useCallback(async (username: string, password: string, displayName?: string) => {
    const data = await apiFetch<{ token: string; user: User }>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName }),
    });
    storeToken(data.token);
    setUser(data.user);
    setNeedsSetup(false);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, needsSetup, login, setup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
