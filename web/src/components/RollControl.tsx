import { useState } from 'react';
import { api } from '../api';
import type { QueueInfo } from '../types';

const who = () => {
  try {
    return localStorage.getItem('kitchenUser') || 'кухня';
  } catch {
    return 'кухня';
  }
};

/**
 * Какой рулон установлен в Epson. Принтер размер носителя не сообщает — это подтверждение
 * оператора, так и пишем. Пока что-то печатается, менять нельзя (сервер не даст).
 */
export default function RollControl({ info, onChanged, suggest }: { info: QueueInfo | null; onChanged: () => void; suggest?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  if (!info?.roll) return null;
  const profiles = (info.profiles || []).filter((p) => p.enabled || p.id === info.roll?.id);
  const title = (id?: string) => profiles.find((p) => p.id === id)?.title || id || '—';
  const r = info.roll;

  async function change(id: string) {
    if (id === r.id) return;
    const ok = window.confirm(
      `Рулон «${title(id)}» физически установлен в Epson и откалиброван?\n\n` +
        'После подтверждения будут печататься задания этого размера. Сайт не проверяет рулон сам — принтер этого не сообщает.'
    );
    if (!ok) return;
    setBusy(true);
    const res: any = await api.setRoll(id, who());
    setBusy(false);
    setMsg(res?.ok ? { kind: 'ok', text: `Установлен рулон: ${title(id)}` } : { kind: 'err', text: res?.error || 'Не получилось' });
    setTimeout(() => setMsg(null), 5000);
    onChanged();
  }

  return (
    <div className="roll-control">
      <div className="roll-now">
        <div className="muted small">Сейчас в Epson</div>
        <div className="roll-title">{title(r.id)}</div>
        <div className="muted small">
          {r.source === 'manual'
            ? `подтвердил вручную ${r.by || '—'}${r.at ? ', ' + new Date(r.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}`
            : 'по умолчанию (вручную не подтверждали)'}
        </div>
      </div>
      <div className="roll-change">
        <div className="muted small">Заменили рулон? Отметьте, какой стоит теперь:</div>
        <div className="chips">
          {profiles.map((p) => (
            <button
              key={p.id}
              disabled={busy}
              className={'chip' + (p.id === r.id ? ' active' : '') + (p.id === suggest && p.id !== r.id ? ' suggest' : '')}
              onClick={() => change(p.id)}
              title={p.ready ? '' : 'Профиль не проверен — автопечать для него выключена'}
            >
              {p.title}
              {!p.ready && <span className="muted"> · не настроен</span>}
            </button>
          ))}
        </div>
      </div>
      {msg && <div className={'banner ' + msg.kind}>{msg.text}</div>}
    </div>
  );
}
