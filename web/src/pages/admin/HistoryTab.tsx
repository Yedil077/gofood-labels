import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import type { PrintJob } from '../../types';
// @ts-ignore
import { STATUS_TEXT } from '../../shared/printQueue.js';
// @ts-ignore
import { profileById } from '../../shared/labelSizes.js';

const tagOf: Record<string, string> = {
  success: 'ok',
  done: 'ok',
  sent: 'ok',
  browser: 'ok',
  'dry-run': 'muted',
  error: 'err',
  uncertain: 'err',
  printing: 'warn',
  sending: 'warn',
  queued: 'muted',
  cancelled: 'muted',
};
const OLD_TEXT: Record<string, string> = { success: 'Завершено', 'dry-run': 'Тест-режим' };

export default function HistoryTab() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [settings, setSettings] = useState<any>(null);
  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => {});
  }, []);
  const [q, setQ] = useState('');
  const load = () => api.history(1000).then((r) => setJobs((r.jobs || []).filter((j) => j.kind !== 'sync')));
  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? jobs.filter((j) => (j.dish?.name || '').toLowerCase().includes(s)) : jobs;
  }, [jobs, q]);

  return (
    <div className="card">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>История печати</h2>
        <div className="row">
          <input type="text" placeholder="Фильтр по блюду…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          <button className="btn" onClick={load}>Обновить</button>
        </div>
      </div>
      <div className="table-scroll">
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Когда</th><th>Блюдо</th><th>Этикеток</th><th>На этикетке</th><th>Размер</th>
              <th>Кто</th><th>Как</th><th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((j) => (
              <tr key={String(j.id)}>
                <td className="mono">{new Date(j.createdAt).toLocaleString('ru-RU')}</td>
                <td>
                  {j.dish?.name}
                  {j.variant === 'aidar' && <span className="tag muted"> Айдар</span>}
                </td>
                <td>
                  <b>{j.quantity}</b>
                  {j.blank ? <span className="muted"> + {j.blank} пуст.</span> : null}
                </td>
                <td className="mono">{j.labelDate} {j.labelTime}</td>
                <td className="muted">{profileById(settings, j.labelSize || '')?.title || j.labelSize || '—'}</td>
                <td>{j.user || '—'}</td>
                <td className="muted">{j.via === 'browser' ? 'браузер' : j.agent || 'агент'}</td>
                <td>
                  <span className={'tag ' + (tagOf[j.status] || 'muted')}>
                    {STATUS_TEXT[j.status] || OLD_TEXT[j.status] || j.status}
                  </span>
                  {!['queued', 'sending', 'printing'].includes(j.status) && (
                    <button
                      className="btn small danger"
                      style={{ marginLeft: 6 }}
                      onClick={async () => {
                        if (!window.confirm(`Удалить запись «${j.dish?.name || ''}» из истории печати?`)) return;
                        const r: any = await api.historyDelete(j.id);
                        if (!r?.ok) alert(r?.error || 'Не получилось');
                        load();
                      }}
                    >
                      Удалить
                    </button>
                  )}
                  {j.error && <div className="muted" style={{ fontSize: 11 }}>{j.error}</div>}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr><td colSpan={8} className="muted">Печати ещё не было.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
