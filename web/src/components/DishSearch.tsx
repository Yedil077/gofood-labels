import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { Dish } from '../types';

interface Props {
  onPick: (dish: Dish) => void;
  selected?: Dish | null;
}

export default function DishSearch({ onPick, selected }: Props) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState<Dish[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listDishes('', false)
      .then((r) => setAll(r.dishes))
      .catch(() => setAll([]));
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all.slice(0, 30);
    const scored = all
      .map((d) => {
        const name = (d.name || '').toLowerCase();
        const code = (d.code || '').toLowerCase();
        const art = (d.artikul || '').toLowerCase();
        let score = -1;
        if (name.startsWith(s) || code.startsWith(s) || art.startsWith(s)) score = 0;
        else if (name.includes(s) || code.includes(s) || art.includes(s)) score = 1;
        else if ((d.category || '').toLowerCase().includes(s)) score = 2;
        return { d, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.d.name.localeCompare(b.d.name));
    return scored.slice(0, 40).map((x) => x.d);
  }, [q, all]);

  function choose(d: Dish) {
    onPick(d);
    setQ(d.name);
    setOpen(false);
  }

  return (
    <div className="search-wrap" ref={boxRef}>
      <svg
        className="search-ic"
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="20.5" y1="20.5" x2="16.5" y2="16.5" />
      </svg>
      <input
        className="search-input"
        type="text"
        placeholder="Поиск блюда — название, артикул или код"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <div className="suggest">
          {results.map((d, i) => (
            <div
              key={d.id}
              className={'suggest-item' + (i === active ? ' active' : '')}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(d)}
            >
              <div>{d.name}</div>
              <div className="meta">
                Код: {d.code || '—'} · Артикул: {d.artikul || '—'}
                {d.category ? ` · ${d.category}` : ''}
                {d.warnings.length ? ` · ⚠️ ${d.warnings.length}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {open && q.trim() && results.length === 0 && (
        <div className="suggest">
          <div className="suggest-item muted">Ничего не найдено. Проверьте импорт Excel в админке.</div>
        </div>
      )}
    </div>
  );
}
