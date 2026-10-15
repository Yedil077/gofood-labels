import { useState } from 'react';
import { api } from '../api';
import { useQueue } from '../useQueue';
import AgentStatus from '../components/AgentStatus';
import RollControl from '../components/RollControl';
// @ts-ignore
import { STATUS_TEXT } from '../shared/printQueue.js';
import type { QueueJob } from '../types';

const TONE: Record<string, string> = {
  queued: 'muted',
  sending: 'warn',
  printing: 'warn',
  done: 'ok',
  sent: 'ok',
  error: 'err',
  cancelled: 'muted',
  uncertain: 'err',
};
const time = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';

export function getKitchenUser() {
  try {
    return localStorage.getItem('kitchenUser') || '';
  } catch {
    return '';
  }
}

/** Общая очередь печати всех компьютеров кухни. */
export default function QueuePage() {
  const { info, error, reload } = useQueue(3000);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [me, setMe] = useState(getKitchenUser);
  const jobs = info?.jobs || [];
  const sizeTitle = (id?: string | null) => info?.profiles?.find((p) => p.id === (id || '80x50'))?.title || id || '—';
  // печатается / ждёт установленный рулон — по порядку; другой размер — отдельно, ждёт замены рулона
  const active = jobs.filter((j) => ['sending', 'printing'].includes(j.status) || (j.status === 'queued' && j.wait !== 'roll'));
  const otherRoll = jobs.filter((j) => j.status === 'queued' && j.wait === 'roll');
  const bySize = otherRoll.reduce<Record<string, QueueJob[]>>((m, j) => {
    const k = j.label_size || '80x50';
    (m[k] ||= []).push(j);
    return m;
  }, {});
  const problems = jobs.filter((j) => ['error', 'uncertain'].includes(j.status));
  const finished = jobs.filter((j) => ['done', 'sent', 'cancelled'].includes(j.status));

  async function act(fn: () => Promise<any>, okText: string) {
    const r = await fn();
    setMsg(r?.ok ? { kind: 'ok', text: okText } : { kind: 'err', text: r?.error || 'Не получилось' });
    reload();
    setTimeout(() => setMsg(null), 4000);
  }

  const row = (j: QueueJob, pos?: number) => (
    <div className={'qrow fade-in' + (j.status === 'printing' || j.status === 'sending' ? ' live' : '')} key={j.id}>
      <div className="qrow-main">
        <div className="qrow-title">
          {pos != null && <span className="qpos">{pos}</span>}
          {j.dish_name || '—'}
        </div>
        <div className="qrow-meta">
          {time(j.created_at)} · {j.user || 'кухня'}
          {` · ${sizeTitle(j.label_size)}`}
          {j.variant === 'aidar' ? ' · Айдар' : ''}
        </div>
        {j.wait === 'profile' && (
          <div className="qrow-note err">Профиль «{sizeTitle(j.label_size)}» не проверен — автопечать выключена (Админ → Профили печати)</div>
        )}
        {(j.error || j.note) && (
          <div className={'qrow-note' + (j.error ? ' err' : '')}>{j.error || j.note}</div>
        )}
      </div>
      <div className="qrow-count">
        <b>{j.filled}</b>
        {j.blank ? <span className="muted"> + {j.blank} пуст.</span> : null}
        <div className="muted small">всего {j.filled + (j.blank || 0)}</div>
      </div>
      <div className="qrow-status">
        <span className={'tag ' + (TONE[j.status] || 'muted')}>
          {(j.status === 'sending' || j.status === 'printing') && <span className="dot-live" />}
          {STATUS_TEXT[j.status] || j.status}
        </span>
      </div>
      <div className="qrow-actions">
        {j.status === 'queued' && (
          <button className="btn small" onClick={() => act(() => api.queueCancel(j.id), 'Задание отменено')}>
            Отменить
          </button>
        )}
        {['error', 'uncertain', 'cancelled'].includes(j.status) && (
          <button
            className="btn small"
            onClick={() => {
              if (j.status === 'uncertain' && !confirm('Результат печати неизвестен. Точно напечатать задание ещё раз?')) return;
              act(() => api.queueRetry(j.id), 'Задание снова в очереди');
            }}
          >
            Повторить
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Очередь печати</h1>
          <p className="muted" style={{ margin: 0 }}>
            Общая для всех компьютеров кухни. Задания печатаются по одному, в порядке поступления.
          </p>
        </div>
        <AgentStatus info={info} error={error} />
      </div>

      {info && !info.online && active.length > 0 && (
        <div className="banner err">
          Печать не идёт: Print Agent на компьютере с принтером не на связи. Задания ждут в очереди —
          запустите агента или печатайте кнопкой «Через браузер».
        </div>
      )}
      {msg && <div className={'banner ' + msg.kind}>{msg.text}</div>}

      <div className="card">
        <RollControl info={info} onChanged={reload} suggest={Object.keys(bySize)[0]} />
      </div>

      {otherRoll.length > 0 && (
        <div className="card wait-roll">
          <h2>Ждут другого рулона <span className="count-pill">{otherRoll.length}</span></h2>
          <p className="muted small">
            На текущем рулоне они не печатаются. Замените рулон и отметьте его выше — задания пойдут по порядку.
          </p>
          {Object.entries(bySize).map(([size, list]) => (
            <div key={size} style={{ marginTop: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{sizeTitle(size)}</b>
                <span className="muted small">
                  {list.length} зад., {list.reduce((a, j) => a + j.filled + (j.blank || 0), 0)} этикеток
                </span>
              </div>
              <div className="qlist">{list.map((j) => row(j))}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>
            Сейчас {active.length ? <span className="count-pill">{active.length}</span> : null}
          </h2>
          <label className="row small" style={{ gap: 6 }}>
            Кто печатает:
            <input
              type="text"
              value={me}
              placeholder="например, Менеджер 1"
              onChange={(e) => {
                setMe(e.target.value);
                try {
                  localStorage.setItem('kitchenUser', e.target.value.trim());
                } catch {
                  /* no-op */
                }
              }}
              style={{ width: 190, padding: '7px 10px' }}
            />
          </label>
        </div>
        {active.length ? (
          <div className="qlist">{active.map((j, i) => row(j, i + 1))}</div>
        ) : (
          <p className="muted">Очередь пуста.</p>
        )}
        <p className="muted small" style={{ marginBottom: 0 }}>
          Отменить можно только задание «В очереди». Если оно уже передано принтеру, остановить его можно только на
          самом принтере / в очереди печати Windows.
        </p>
      </div>

      {problems.length > 0 && (
        <div className="card">
          <h2>Требуют внимания</h2>
          <p className="muted small">
            «Неизвестно» — связь с принтером оборвалась после отправки. Сначала проверьте, вышли ли наклейки, и только потом
            нажимайте «Повторить», иначе будут дубликаты.
          </p>
          <div className="qlist">{problems.map((j) => row(j))}</div>
        </div>
      )}

      <div className="card">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Готово за сутки</h2>
          {finished.length > 0 && (
            <button className="btn small" onClick={() => act(() => api.queueClear(), 'Список очищен (история сохранена)')}>
              Очистить завершённые
            </button>
          )}
        </div>
        {finished.length ? (
          <div className="qlist">{finished.map((j) => row(j))}</div>
        ) : (
          <p className="muted">Пока ничего.</p>
        )}
        <p className="muted small" style={{ marginBottom: 0 }}>
          «Завершено» значит, что Windows полностью передал задание принтеру. Что наклейки физически вышли, принтер
          сайту не сообщает.
        </p>
      </div>
    </div>
  );
}
