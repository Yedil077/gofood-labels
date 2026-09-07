import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { renderLabel } from '../../label/renderBrowser';
// @ts-ignore
import { calculateLabelDateTime, localKey } from '../../shared/labelDateTime.js';
// @ts-ignore
import { normalizeDishForLabel } from '../../shared/normalize.js';
import type { Dish, Settings } from '../../types';

export default function DishesTab() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(true);
  const [cats, setCats] = useState<string[]>([]);
  const [edit, setEdit] = useState<Dish | null>(null);
  const [params, setParams] = useSearchParams();

  function load() {
    api.listDishes('', true).then((r) => setDishes(r.dishes));
    api.categories().then((r) => setCats(r.categories));
  }
  useEffect(() => {
    load();
    api.getSettings().then((r) => setSettings(r.settings));
  }, []);

  useEffect(() => {
    const id = params.get('edit');
    if (id && dishes.length) {
      const d = dishes.find((x) => String(x.id) === id);
      if (d) setEdit(d);
    }
  }, [params, dishes]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return dishes
      .filter((d) => (showAll ? true : d.active))
      .filter(
        (d) =>
          !s ||
          d.name.toLowerCase().includes(s) ||
          (d.code || '').includes(s) ||
          (d.artikul || '').includes(s) ||
          (d.category || '').toLowerCase().includes(s)
      );
  }, [dishes, q, showAll]);

  async function save(patch: Partial<Dish>) {
    if (!edit) return;
    const r = await api.updateDish(edit.id, patch);
    setEdit(r.dish);
    load();
  }
  function close() {
    setEdit(null);
    params.delete('edit');
    setParams(params, { replace: true });
  }

  return (
    <div className="card">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Блюда ({dishes.length})</h2>
        <div className="row wrap">
          <input
            type="text"
            placeholder="Фильтр…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 240 }}
          />
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            показывать выключенные
          </label>
        </div>
      </div>

      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Название</th><th>Категория</th><th>Код</th><th>Артикул</th><th>Заполнено</th><th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 600).map((d) => (
            <tr key={d.id}>
              <td>{!d.active && <span className="tag muted">выкл</span>} {d.name}</td>
              <td>
                {d.category || <span className="muted">—</span>}{' '}
                {d.category_source === 'manual' && <span className="pill-src">(вручную)</span>}
                {d.category_source === 'uncertain' && <span className="pill-src">(?)</span>}
              </td>
              <td className="mono">{d.code || '—'}</td>
              <td className="mono">{d.artikul || '—'}</td>
              <td>
                {d.warnings.length === 0 ? (
                  <span className="tag ok">полно</span>
                ) : (
                  <span className="tag warn">нет: {d.warnings.map((w) => w.code).join(', ')}</span>
                )}
              </td>
              <td className="right">
                <button className="btn" onClick={() => setEdit(d)}>Изменить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {edit && settings && <EditModal dish={edit} settings={settings} cats={cats} onSave={save} onClose={close} />}
    </div>
  );
}

function EditModal({
  dish,
  settings,
  cats,
  onSave,
  onClose,
}: {
  dish: Dish;
  settings: Settings;
  cats: string[];
  onSave: (p: Partial<Dish>) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    name: dish.name,
    category: dish.category || '',
    composition: dish.composition || '',
    protein: dish.protein ?? '',
    fat: dish.fat ?? '',
    carbs: dish.carbs ?? '',
    kcal: dish.kcal ?? '',
    shelf_life_hours: dish.shelf_life_hours ?? '',
    storage_text: dish.storage_text || '',
    barcode_source: dish.barcode_source || '',
    diet_type: dish.diet_type || '',
    active: dish.active,
  });
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const dt = calculateLabelDateTime(localKey(new Date()), settings.datetime);
    const merged: any = {
      ...dish,
      ...f,
      protein: f.protein === '' ? null : Number(f.protein),
      fat: f.fat === '' ? null : Number(f.fat),
      carbs: f.carbs === '' ? null : Number(f.carbs),
      kcal: f.kcal === '' ? null : Number(f.kcal),
      barcode_source: f.barcode_source || null,
      diet_type: f.diet_type || null,
    };
    const data = normalizeDishForLabel(merged, settings, dt);
    renderLabel(canvasRef.current, data, {
      widthMm: Number(settings['label.widthMm']) || 100,
      heightMm: Number(settings['label.heightMm']) || 70,
      dpi: Number(settings['label.dpi']) || 300,
      safeMm: Number(settings['label.safeMm']) || 3,
      symbology: settings['barcode.symbology'] || 'code128',
    });
  }, [JSON.stringify(f)]);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 920 }}>
        <div className="split2">
          <div>
            <h2>Редактирование блюда</h2>

            <label className="fld">Название</label>
            <textarea value={f.name} onChange={(e) => set('name', e.target.value)} />

            <label className="fld">Категория (источник: {dish.category_source})</label>
            <input type="text" list="cats" value={f.category} onChange={(e) => set('category', e.target.value)} />
            <datalist id="cats">
              {cats.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>

            <label className="fld">Состав (вводится вручную, не выдумывается)</label>
            <textarea
              value={f.composition}
              placeholder="Напр.: телятина, шампиньоны, лук, сливки, макароны из твёрдых сортов пшеницы, масло, соль"
              onChange={(e) => set('composition', e.target.value)}
            />

            <label className="fld">КБЖУ (на порцию)</label>
            <div className="row wrap">
              {(['protein', 'fat', 'carbs', 'kcal'] as const).map((k) => (
                <span key={k}>
                  {{ protein: 'Белки', fat: 'Жиры', carbs: 'Углеводы', kcal: 'Ккал' }[k]}
                  <input
                    type="number"
                    value={(f as any)[k]}
                    onChange={(e) => set(k, e.target.value)}
                    style={{ width: 90 }}
                  />
                </span>
              ))}
            </div>

            <div className="split2">
              <div>
                <label className="fld">Срок годности, ч</label>
                <input
                  type="number"
                  value={f.shelf_life_hours}
                  onChange={(e) => set('shelf_life_hours', e.target.value)}
                />
              </div>
              <div>
                <label className="fld">Источник штрихкода</label>
                <select value={f.barcode_source} onChange={(e) => set('barcode_source', e.target.value)}>
                  <option value="">по умолчанию (из настроек)</option>
                  <option value="code">Код</option>
                  <option value="artikul">Артикул</option>
                </select>
              </div>
            </div>

            <label className="fld">
              Тип питания{' '}
              <span className="muted">(значок на этикетке; авто — по категории/названию: {dish.diet_type_auto === 'pp' ? 'ПП' : 'Классический'})</span>
            </label>
            <select value={f.diet_type} onChange={(e) => set('diet_type', e.target.value)}>
              <option value="">авто ({dish.diet_type_auto === 'pp' ? 'ПП' : 'Классический'})</option>
              <option value="pp">ПП</option>
              <option value="classic">Классический</option>
            </select>

            <label className="fld">Условия хранения (переопределение)</label>
            <input
              type="text"
              value={f.storage_text}
              placeholder="если пусто — из общих настроек"
              onChange={(e) => set('storage_text', e.target.value)}
            />

            <label className="row" style={{ gap: 8, marginTop: 12 }}>
              <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
              Блюдо доступно для печати
            </label>

            <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>Закрыть</button>
              <button
                className="btn primary"
                onClick={() =>
                  onSave({
                    name: f.name,
                    category: f.category,
                    composition: f.composition,
                    protein: f.protein === '' ? null : Number(f.protein),
                    fat: f.fat === '' ? null : Number(f.fat),
                    carbs: f.carbs === '' ? null : Number(f.carbs),
                    kcal: f.kcal === '' ? null : Number(f.kcal),
                    shelf_life_hours: f.shelf_life_hours === '' ? null : Number(f.shelf_life_hours),
                    storage_text: f.storage_text,
                    barcode_source: f.barcode_source || null,
                    active: f.active,
                  } as any)
                }
              >
                Сохранить
              </button>
            </div>
          </div>

          <div>
            <label className="fld">Превью (обновляется на лету)</label>
            <div
              className="preview-frame"
              style={{
                width: '100%',
                aspectRatio: `${Number(settings['label.widthMm']) || 100} / ${Number(settings['label.heightMm']) || 70}`,
              }}
            >
              <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
