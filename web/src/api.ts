import * as XLSX from 'xlsx';
import { API_BASE, getToken } from './config';
import type { Dish, Settings, PrintJob, LogRow, ImportResult, LabelDateTime, QueueInfo } from './types';

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
  adminCheck: () => req<{ ok: boolean; tokenRequired: boolean }>('/admin/check'),

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
  setDietType: (id: number, value: 'pp' | 'classic' | null) =>
    req<{ dish: Dish }>(`/dishes/${id}/diet-type`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  categories: () => req<{ categories: string[] }>('/dishes/categories'),

  labelDateTime: (local?: string) =>
    req<LabelDateTime>(`/label/datetime${local ? `?local=${encodeURIComponent(local)}` : ''}`),

  importRows: (filename: string, rows: any[][]) =>
    req<ImportResult>('/import', { method: 'POST', body: JSON.stringify({ filename, rows }) }),
  importKbju: (filename: string, rows: any[][]) =>
    req<{ ok: boolean; received: number; matched: number; notFound: number; error?: string }>(
      '/import/kbju',
      { method: 'POST', body: JSON.stringify({ filename, rows }) }
    ),
  importBatches: () => req<{ batches: any[] }>('/import/batches'),
  clearKbju: () => req<{ ok: boolean; cleared: number }>('/import/kbju', { method: 'DELETE' }),

  print: (body: {
    dishId: number;
    quantity: number;
    weight?: string;
    dietType?: 'pp' | 'classic';
    labelSize?: string;
    variant?: string;
    ignoreWarnings?: boolean;
    clientLocal?: string;
    user?: string;
  }) => req('/print', { method: 'POST', body: JSON.stringify(body) }),
  testPrint: (copies = 1) =>
    req('/print/test', { method: 'POST', body: JSON.stringify({ copies }) }),

  agentInfo: () =>
    req<{
      agent:
        | {
            agent: string;
            platform: string;
            printers: string[];
            at: string;
            lastSyncAt?: string | null;
            iikoConfigured?: boolean;
          }
        | null;
      online: boolean;
    }>('/agent/info'),

  syncStatus: () =>
    req<{ enabled: boolean; everyHours: number; lastRunAt: string | null; lastResult: any }>('/sync/status'),
  syncRun: () => req<{ ok: boolean; jobId: number }>('/sync/run', { method: 'POST', body: '{}' }),
  /** Новые блюда из iiko: без `add` — список; с `add` (артикулы) — добавить. */
  newDishes: (add?: string[]) =>
    req<{
      ok: boolean;
      error?: string;
      candidates?: { name: string; num: string; code: string; category: string; composition: string }[];
      added?: number;
      names?: string[];
    }>('/sync/new-dishes', { method: 'POST', body: JSON.stringify(add ? { add } : {}) }),

  history: (limit = 200) => req<{ jobs: PrintJob[] }>(`/history?limit=${limit}`),
  /** Общая очередь печати. summary=true — только счётчик и статус агента. */
  queue: (summary = false) => req<QueueInfo>(`/queue${summary ? '?summary=1' : ''}`),
  queueCancel: (id: string) => req<{ ok: boolean; error?: string }>(`/queue/${id}/cancel`, { method: 'POST', body: '{}' }),
  queueRetry: (id: string) => req<{ ok: boolean; error?: string }>(`/queue/${id}/retry`, { method: 'POST', body: '{}' }),
  queueClear: () => req<{ ok: boolean; hidden: number }>('/queue/clear', { method: 'POST', body: '{}' }),
  /** Записать печать через браузер в историю. */
  logPrint: (body: {
    dishId: number;
    quantity: number;
    labelDate?: string;
    labelTime?: string;
    labelSize?: string;
    variant?: string;
    user?: string;
  }) => req<{ ok: boolean }>('/print/log', { method: 'POST', body: JSON.stringify(body) }),
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
