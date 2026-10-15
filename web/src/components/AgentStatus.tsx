import type { QueueInfo } from '../types';
// @ts-ignore
import { printerHealth } from '../shared/printerState.js';

const rollTitle = (info: QueueInfo) =>
  info.profiles?.find((p) => p.id === info.roll?.id)?.title || info.roll?.id || '—';

/** Плашки: агент, Epson в Windows, установленный рулон, можно ли печатать, сколько ждёт. */
export default function AgentStatus({ info, error, compact }: { info: QueueInfo | null; error?: boolean; compact?: boolean }) {
  if (error) return <span className="status-pill off"><span className="dot" />Нет связи с сайтом</span>;
  if (!info) return <span className="status-pill"><span className="dot" />Проверяю…</span>;
  const h = info.online ? printerHealth(info.printerStatus) : 'unknown';
  const printerText =
    !info.online ? 'Epson: нет данных' : h === 'ok' ? 'Epson в сети' : h === 'offline' ? 'Epson не в сети' : h === 'error' ? `Epson: ${info.printerStatus?.status}` : 'Epson: состояние неизвестно';
  return (
    <div className={'agent-status' + (compact ? ' compact' : '')}>
      <span className={'status-pill ' + (info.online ? 'on' : 'off')} title={info.agent?.name ? `Print Agent: ${info.agent.name}` : ''}>
        <span className="dot" />
        {info.online ? 'Агент на связи' : 'Агент не на связи'}
      </span>
      <span className={'status-pill ' + (h === 'ok' ? 'on' : h === 'unknown' ? 'neutral' : 'off')} title={info.printer || ''}>
        <span className="dot" />
        {printerText}
      </span>
      {info.roll && (
        <span
          className="status-pill neutral"
          title={info.roll.source === 'manual' ? `Подтвердил ${info.roll.by || '—'}` : 'Рулон по умолчанию, вручную не подтверждали'}
        >
          Рулон: {rollTitle(info)}
          {info.roll.source === 'manual' ? ' ✓' : ' (по умолч.)'}
        </span>
      )}
      {!compact && <span className="status-pill neutral">В очереди: {info.pending}</span>}
      {info.online && info.canPrint === false && info.blockedReason && (
        <span className="status-pill off">{info.blockedReason}</span>
      )}
    </div>
  );
}
