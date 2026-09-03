import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { LogRow } from '../../types';

export default function ErrorsTab() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [filter, setFilter] = useState('');

  const load = () => api.logs().then((r) => setLogs(r.logs));
  useEffect(() => {
    load();
  }, []);

  const shown = logs.filter((l) => !filter || l.level === filter);

  return (
    <div className="card">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Логи ошибок и событий</h2>
        <div className="row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">все уровни</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
          </select>
          <button className="btn" onClick={load}>
            Обновить
          </button>
          <button
            className="btn"
            onClick={async () => {
              if (confirm('Очистить все логи?')) {
                await api.clearLogs();
                load();
              }
            }}
          >
            Очистить
          </button>
        </div>
      </div>

      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Время</th>
            <th>Уровень</th>
            <th>Контекст</th>
            <th>Сообщение</th>
            <th>Детали</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((l) => (
            <tr key={l.id}>
              <td className="mono">{l.created_at}</td>
              <td>
                <span
                  className={
                    'tag ' + (l.level === 'error' ? 'err' : l.level === 'warn' ? 'warn' : 'muted')
                  }
                >
                  {l.level}
                </span>
              </td>
              <td>{l.context}</td>
              <td>{l.message}</td>
              <td className="mono" style={{ fontSize: 11, maxWidth: 360, wordBreak: 'break-word' }}>
                {l.detail}
              </td>
            </tr>
          ))}
          {!shown.length && (
            <tr>
              <td colSpan={5} className="muted">
                Записей нет.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
