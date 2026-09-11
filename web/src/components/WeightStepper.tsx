interface Props {
  value: string;
  onChange: (v: string) => void;
  step?: number;
  placeholder?: string;
}

/** Разбирает «340 г» / «0.5 л» на число + единицу. */
function parse(v: string): { num: number; unit: string } | null {
  const m = String(v || '')
    .trim()
    .match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  return { num, unit: m[2] || 'г' };
}

/** Поле веса порции: как QuantityStepper, но с текстом и единицей измерения. */
export default function WeightStepper({ value, onChange, step = 10, placeholder }: Props) {
  const p = parse(value);
  const bump = (delta: number) => {
    if (!p) return;
    const n = Math.max(0, Math.round((p.num + delta) * 10) / 10);
    onChange(`${n} ${p.unit}`.trim());
  };
  return (
    <div className="qty weight-qty" role="group" aria-label="Вес порции">
      <button type="button" onClick={() => bump(-step)} aria-label="Меньше" disabled={!p}>
        −
      </button>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button type="button" onClick={() => bump(step)} aria-label="Больше" disabled={!p}>
        +
      </button>
    </div>
  );
}
