interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

export default function QuantityStepper({ value, onChange, min = 1, max = 999 }: Props) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n || min)));
  return (
    <div className="qty" role="group" aria-label="Количество этикеток">
      <button type="button" onClick={() => onChange(clamp(value - 1))} aria-label="Меньше">
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        onBlur={(e) => onChange(clamp(Number(e.target.value)))}
      />
      <button type="button" onClick={() => onChange(clamp(value + 1))} aria-label="Больше">
        +
      </button>
    </div>
  );
}
