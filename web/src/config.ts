// База API. По умолчанию — тот же origin (Netlify: /api/*).
// Можно переопределить для локального агента: VITE_API_BASE или localStorage 'apiBase'.
const fromEnv = (import.meta as any).env?.VITE_API_BASE as string | undefined;
const fromLs = typeof localStorage !== 'undefined' ? localStorage.getItem('apiBase') || '' : '';
export const API_BASE = (fromLs || fromEnv || '') + '/api';

export function getToken(): string {
  try {
    return localStorage.getItem('gofoodToken') || '';
  } catch {
    return '';
  }
}
export function setToken(t: string) {
  try {
    if (t) localStorage.setItem('gofoodToken', t);
    else localStorage.removeItem('gofoodToken');
  } catch {
    /* no-op */
  }
}
export function setApiBase(b: string) {
  try {
    if (b) localStorage.setItem('apiBase', b.replace(/\/$/, ''));
    else localStorage.removeItem('apiBase');
  } catch {
    /* no-op */
  }
}
export function getApiBaseRaw(): string {
  try {
    return localStorage.getItem('apiBase') || '';
  } catch {
    return '';
  }
}
