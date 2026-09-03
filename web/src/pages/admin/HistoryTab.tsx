import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { PrintJob } from '../../types';

const tagOf: Record<string, string> = {
  success: 'ok',
  'dry-run': 'muted',
  error: 'err',
  printing: 'warn',
  queued: 'warn',
};

export default function HistoryTab() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const load = () => api.history(500).then((r) => setJobs(r.jobs || []));
  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>История печати</h2>
        <button className="btn" onClick={load}>Обновить</button>
      </div>
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Дата/время</th><th>Блюдо</th><th>Код</th><th>Кол-во</th><th>На этикетке</th>
            <th>Пользователь</th><th>Агент</th><th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="mono">{new Date(j.createdAt).toLocaleString('ru-RU')}</td>
              <td>{j.dish?.name}</td>
              <td className="mono">{j.dish?.code || '—'}</td>
              <td>{j.quantity}</td>
              <td className="mono">{j.labelDate} {j.labelTime}</td>
              <td>{j.user}</td>
              <td>{j.agent || '—'}</td>
              <td>
                <span className={'tag ' + (tagOf[j.status] || 'muted')}>{j.status}</span>
                {j.error && <div className="muted" style={{ fontSize: 11 }}>{j.error}</div>}
              </td>
            </tr>
          ))}
          {!jobs.length && (
            <tr><td colSpan={8} className="muted">Печати ещё не было.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
