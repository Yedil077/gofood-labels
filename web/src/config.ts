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
/** Выбранный размер этикетки ('80x50' | '100x70'), хранится в браузере, как тема. '' — не выбран. */
export function getLabelSizeId(): string {
  try {
    return localStorage.getItem('labelSize') || '';
  } catch {
    return '';
  }
}
export function setLabelSizeId(v: string) {
  try {
    localStorage.setItem('labelSize', v);
  } catch {
    /* no-op */
  }
}
/** Выбранный вариант печати ('standard' | 'aidar'), хранится в браузере. */
export function getPrintVariantId(): string {
  try {
    return localStorage.getItem('printVariant') || 'standard';
  } catch {
    return 'standard';
  }
}
export function setPrintVariantId(v: string) {
  try {
    localStorage.setItem('printVariant', v);
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
