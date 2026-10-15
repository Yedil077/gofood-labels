import type { QueueInfo } from '../types';

/** Плашка: агент на связи / нет, активный принтер, сколько ждёт в очереди. */
export default function AgentStatus({ info, error, compact }: { info: QueueInfo | null; error?: boolean; compact?: boolean }) {
  if (error) return <span className="status-pill off"><span className="dot" />Нет связи с сайтом</span>;
  if (!info) return <span className="status-pill"><span className="dot" />Проверяю…</span>;
  const printer = info.printer || info.agent?.printers?.find((p) => /cw-c40/i.test(p)) || '';
  return (
    <div className={'agent-status' + (compact ? ' compact' : '')}>
      <span className={'status-pill ' + (info.online ? 'on' : 'off')}>
        <span className="dot" />
        {info.online ? `Агент на связи${info.agent?.name ? ' · ' + info.agent.name : ''}` : 'Агент не на связи'}
      </span>
      {printer && <span className="status-pill neutral">🖨 {printer}</span>}
      <span className="status-pill neutral">В очереди: {info.pending}</span>
    </div>
  );
}
