import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PrinterStatus } from '../types';
// @ts-ignore
import { getProfiles, normalizeProfile } from '../shared/labelSizes.js';

type P = ReturnType<typeof normalizeProfile> & Record<string, any>;

/**
 * Профили печати: администратор добавляет форматы и указывает, как их печатать.
 * Сайт НЕ меняет настройки драйвера — поля «носитель в драйвере» справочные (что должно
 * стоять в сохранённых настройках соответствующей очереди Windows).
 */
export default function ProfilesEditor({ value, onChange }: { value: any; onChange: (v: P[]) => void }) {
  const list: P[] = getProfiles({ 'print.profiles': value });
  const [printers, setPrinters] = useState<string[]>([]);
  const [status, setStatus] = useState<PrinterStatus[]>([]);
  useEffect(() => {
    api.queue(true).then((r: any) => {
      setPrinters(r?.agent?.printers || []);
      setStatus(r?.printers || []);
    });
  }, []);

  const upd = (i: number, patch: Partial<P>) => onChange(list.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const updMedia = (i: number, patch: Record<string, any>) => upd(i, { media: { ...list[i].media, ...patch } });
  const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  function add() {
    const base = 'custom';
    let n = 1;
    while (list.some((p) => p.id === `${base}${n}`)) n++;
    onChange([...list, normalizeProfile({ id: `${base}${n}`, title: 'Новый формат', widthMm: 60, heightMm: 40, ready: false, enabled: false })]);
  }
  function remove(i: number) {
    if (list.length <= 1) return;
    if (!window.confirm(`Удалить профиль «${list[i].title}»? Задания этого размера в очереди останутся, но печатать их будет нечем.`)) return;
    onChange(list.filter((_, k) => k !== i));
  }

  return (
    <div className="profiles">
      {list.map((p, i) => {
        const st = status.find((s) => s.name === (p.windowsPrinter || status[0]?.name));
        return (
          <div className={'profile-card' + (p.ready ? ' ready' : '')} key={p.id + i}>
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <b>
                {p.title} <span className="muted small mono">{p.code}</span>
              </b>
              <div className="row wrap small">
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={p.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} />
                  на экране печати
                </label>
                <label className="row" style={{ gap: 6 }} title="Проверено на реальном рулоне — агенту можно печатать автоматически">
                  <input type="checkbox" checked={p.ready} onChange={(e) => upd(i, { ready: e.target.checked })} />
                  проверен, автопечать
                </label>
                {i > 0 && (
                  <button className="btn small" onClick={() => remove(i)}>Удалить</button>
                )}
              </div>
            </div>

            <div className="profile-grid">
              <div>
                <label className="fld">Название</label>
                <input type="text" value={p.title} onChange={(e) => upd(i, { title: e.target.value })} />
              </div>
              <div>
                <label className="fld">Код</label>
                <input type="text" value={p.code} onChange={(e) => upd(i, { code: e.target.value })} />
              </div>
              <div>
                <label className="fld">Этикетка (PDF), мм</label>
                <div className="row">
                  <input type="number" value={p.widthMm} onChange={(e) => upd(i, { widthMm: Number(e.target.value) })} />
                  ×
                  <input type="number" value={p.heightMm} onChange={(e) => upd(i, { heightMm: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="fld">Форма</label>
                <select value={p.shape} onChange={(e) => upd(i, { shape: e.target.value })}>
                  <option value="rect">прямоугольная</option>
                  <option value="round">круглая (квадратный носитель)</option>
                </select>
              </div>

              <div>
                <label className="fld">Очередь Windows (принтер)</label>
                <select value={p.windowsPrinter} onChange={(e) => upd(i, { windowsPrinter: e.target.value })}>
                  <option value="">основной принтер агента</option>
                  {[...new Set([...printers, p.windowsPrinter].filter(Boolean))].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="fld">Бумага в драйвере (имя)</label>
                <input type="text" value={p.paperName} placeholder="не менять" onChange={(e) => upd(i, { paperName: e.target.value })} />
              </div>
              <div>
                <label className="fld">Ориентация (для SumatraPDF)</label>
                <select value={p.orientation} onChange={(e) => upd(i, { orientation: e.target.value })}>
                  <option value="auto">авто (поворот по странице)</option>
                  <option value="portrait">книжная</option>
                  <option value="landscape">альбомная</option>
                </select>
              </div>
              <div className="muted small" style={{ alignSelf: 'end' }}>
                {st ? (
                  <>
                    Windows: {st.found ? st.status : 'очередь не найдена'}
                    {st.paper ? `, бумага драйвера ${st.paper.name} ${st.paper.widthMm}×${st.paper.lengthMm}` : ''} — справочно
                  </>
                ) : (
                  'Состояние очереди появится, когда агент на связи'
                )}
              </div>
            </div>

            <details className="small" style={{ marginTop: 8 }}>
              <summary>Носитель в драйвере Epson (справочно — сайт это не меняет)</summary>
              <div className="profile-grid" style={{ marginTop: 8 }}>
                <div>
                  <label className="fld">Width, мм</label>
                  <input type="number" value={p.media.widthMm ?? ''} onChange={(e) => updMedia(i, { widthMm: numOrNull(e.target.value) })} />
                </div>
                <div>
                  <label className="fld">Length, мм</label>
                  <input type="number" value={p.media.lengthMm ?? ''} onChange={(e) => updMedia(i, { lengthMm: numOrNull(e.target.value) })} />
                </div>
                <div>
                  <label className="fld">Gap, мм</label>
                  <input type="number" value={p.media.gapMm ?? ''} onChange={(e) => updMedia(i, { gapMm: numOrNull(e.target.value) })} />
                </div>
                <div>
                  <label className="fld">Orientation</label>
                  <input type="text" value={p.media.orientation || ''} onChange={(e) => updMedia(i, { orientation: e.target.value })} />
                </div>
                <div>
                  <label className="fld">Media Form</label>
                  <input type="text" value={p.media.form || ''} onChange={(e) => updMedia(i, { form: e.target.value })} />
                </div>
                <div>
                  <label className="fld">Cut</label>
                  <input type="text" value={p.media.cut || ''} onChange={(e) => updMedia(i, { cut: e.target.value })} />
                </div>
              </div>
            </details>
          </div>
        );
      })}
      <button className="btn" onClick={add}>+ Добавить формат</button>
    </div>
  );
}
