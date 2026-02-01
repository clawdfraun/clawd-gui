const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('clawd-gui-jwt');
}

export function setToken(token: string): void {
  localStorage.setItem('clawd-gui-jwt', token);
}

export function clearToken(): void {
  localStorage.removeItem('clawd-gui-jwt');
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers || {}) as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}
