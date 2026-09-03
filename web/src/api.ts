import * as XLSX from 'xlsx';
import { API_BASE, getToken } from './config';
import type { Dish, Settings, PrintJob, LogRow, ImportResult, LabelDateTime } from './types';

async function req<T = any>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as any) };
  if (init?.body) headers['Content-Type'] = 'application/json';
  const tok = getToken();
  if (tok) headers['Authorization'] = 'Bearer ' + tok;
  const res = await fetch(API_BASE + path, { ...init, headers });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : {};
  return { ...data, _status: res.status, _ok: res.ok } as T;
}

export const api = {
  health: () => req('/health'),

  getSettings: () => req<{ settings: Settings }>('/settings'),
  saveSettings: (patch: Record<string, any>) =>
    req<{ settings: Settings }>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  listDishes: (q = '', all = false) =>
    req<{ total: number; count: number; dishes: Dish[] }>(
      `/dishes?q=${encodeURIComponent(q)}${all ? '&all=1' : ''}`
    ),
  getDish: (id: number) => req<{ dish: Dish }>(`/dishes/${id}`),
  updateDish: (id: number, patch: Partial<Dish>) =>
    req<{ dish: Dish }>(`/dishes/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  categories: () => req<{ categories: string[] }>('/dishes/categories'),

  labelDateTime: (local?: string) =>
    req<LabelDateTime>(`/label/datetime${local ? `?local=${encodeURIComponent(local)}` : ''}`),

  importRows: (filename: string, rows: any[][]) =>
    req<ImportResult>('/import', { method: 'POST', body: JSON.stringify({ filename, rows }) }),
  importBatches: () => req<{ batches: any[] }>('/import/batches'),

  print: (body: { dishId: number; quantity: number; ignoreWarnings?: boolean; clientLocal?: string; user?: string }) =>
    req('/print', { method: 'POST', body: JSON.stringify(body) }),
  testPrint: (copies = 1) =>
    req('/print/test', { method: 'POST', body: JSON.stringify({ copies }) }),

  agentInfo: () =>
    req<{ agent: { agent: string; platform: string; printers: string[]; at: string } | null; online: boolean }>(
      '/agent/info'
    ),

  history: (limit = 200) => req<{ jobs: PrintJob[] }>(`/history?limit=${limit}`),
  logs: () => req<{ logs: LogRow[] }>('/logs'),
  clearLogs: () => req('/logs', { method: 'DELETE' }),
};

/** Читает .xlsx в браузере и возвращает массив массивов (как ждёт /import). */
export async function xlsxFileToRows(file: File): Promise<any[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false }) as any[][];
}
