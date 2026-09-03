import type { Warning } from '../types';

export default function WarningsPanel({
  warnings,
  onFix,
}: {
  warnings: Warning[];
  onFix?: () => void;
}) {
  if (!warnings.length) return null;
  return (
    <div className="warns">
      {warnings.map((w) => (
        <div className="warn-item" key={w.code}>
          <span>⚠️</span>
          <span style={{ flex: 1 }}>{w.text}</span>
          {onFix && (
            <button className="btn ghost" style={{ color: 'inherit', fontWeight: 700 }} onClick={onFix}>
              Заполнить
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
