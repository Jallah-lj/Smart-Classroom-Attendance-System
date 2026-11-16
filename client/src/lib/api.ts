export const API_BASE = '/api/v1';

export function getStoredToken(): string | null {
  return localStorage.getItem('apex_auth_token');
}

export function setStoredToken(token: string): void {
  localStorage.setItem('apex_auth_token', token);
}

export function clearStoredToken(): void {
  localStorage.removeItem('apex_auth_token');
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error: any = new Error(data.message || 'Request failed');
    error.status = res.status;
    error.code = data.error;
    error.failedRule = data.failedRule;
    throw error;
  }

  return data as T;
}
