import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DishSearch from '../components/DishSearch';
import QuantityStepper from '../components/QuantityStepper';
import LabelPreview from '../components/LabelPreview';
import WarningsPanel from '../components/WarningsPanel';
import { api } from '../api';
// @ts-ignore
import { calculateLabelDateTime, localKey } from '../shared/labelDateTime.js';
// @ts-ignore
import { normalizeDishForLabel } from '../shared/normalize.js';
import type { Dish, Settings } from '../types';

export default function PrintPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dish, setDish] = useState<Dish | null>(null);
  const [qty, setQty] = useState(1);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    null | { kind: 'ok' | 'err' | 'wait'; text: string; note?: string }
  >(null);
  const [confirm, setConfirm] = useState<null | { warnings: { code: string; text: string }[] }>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings));
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const dtCfg = settings?.datetime;
  const dt = useMemo(
    () => (dtCfg ? calculateLabelDateTime(localKey(now), dtCfg) : null),
    [dtCfg, now]
  );

  const rp = useMemo(
    () => ({
      widthMm: Number(settings?.['label.widthMm']) || 100,
      heightMm: Number(settings?.['label.heightMm']) || 70,
      dpi: Number(settings?.['label.dpi']) || 300,
      safeMm: Number(settings?.['label.safeMm']) || 3,
      symbology: settings?.['barcode.symbology'] || 'code128',
      brandColor: settings?.['brand.primaryColor'] || '#F2661F',
    }),
    [settings]
  );

  const labelData = useMemo(() => {
    if (!settings || !dt) return null;
    const src = dish || {
      name: 'Название блюда',
      category: 'Категория',
      code: '0000',
      artikul: '00000',
    };
    return normalizeDishForLabel(src, settings, dt);
  }, [dish, settings, dt]);

  async function doPrint(ignoreWarnings = false) {
    if (!dish) return;
    setBusy(true);
    setResult(null);
    try {
      const r: any = await api.print({
        dishId: dish.id,
        quantity: qty,
        ignoreWarnings,
        clientLocal: localKey(new Date()),
        user: localStorage.getItem('kitchenUser') || 'kitchen',
      });
      if (r._status === 409 && r.needsConfirm) {
        setConfirm({ warnings: r.warnings || [] });
        return;
      }
      if (r.ok) {
        setConfirm(null);
        setResult({
          kind: 'wait',
          text: `Задание #${r.jobId} создано (${qty} шт., ${r.labelDate} ${r.labelTime}). Ожидание агента печати…`,
          note: r.approximateTime
            ? 'Время рассчитано приблизительно — уточните формулу в Настройках → Дата/время.'
            : undefined,
        });
        watchJob(r.jobId);
      } else {
        setResult({ kind: 'err', text: r.error || 'Не удалось создать задание' });
      }
    } catch (e: any) {
      setResult({ kind: 'err', text: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  function watchJob(jobId: number) {
    if (pollRef.current) clearInterval(pollRef.current);
    let tries = 0;
    pollRef.current = window.setInterval(async () => {
      tries++;
      try {
        const h = await api.history(50);
        const j = h.jobs?.find((x) => x.id === jobId);
        if (j && ['success', 'error', 'dry-run'].includes(j.status)) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (j.status === 'error')
            setResult({ kind: 'err', text: `Задание #${jobId}: ошибка печати — ${j.error || 'см. логи'}` });
          else
            setResult({
              kind: 'ok',
              text:
                j.status === 'dry-run'
                  ? `Задание #${jobId}: агент в тест-режиме (PDF сохранён, не напечатано).`
                  : `Задание #${jobId}: напечатано ✓ (${j.via || 'принтер'}).`,
            });
        }
      } catch {
        /* keep polling */
      }
      if (tries > 20) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setResult((cur) =>
          cur?.kind === 'wait'
            ? {
                kind: 'err',
                text: `Задание #${jobId} создано, но агент печати не ответил. Проверьте, что Print Agent запущен на ПК с принтером.`,
              }
            : cur
        );
      }
    }, 2000);
  }

  return (
    <div>
      <h1>Печать этикеток</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Найдите блюдо → проверьте превью → количество → «Печать».
      </p>

      {dt && (
        <div className={'banner ' + (dt.approximate ? 'warn' : 'ok')} style={{ maxWidth: 640 }}>
          Дата/время на этикетке: <b>{dt.date} {dt.time}</b>
          {dt.approximate ? ' — приблизительно (формулу времени уточните в админке).' : ' — по контрольному правилу.'}
        </div>
      )}

      <div className="grid-print">
        <div className="card">
          <label className="fld">Поиск блюда</label>
          <DishSearch onPick={(d) => { setDish(d); setResult(null); }} />

          {dish && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{dish.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Категория: {dish.category || '— не указана'} · Код: {dish.code || '—'} · Артикул: {dish.artikul || '—'} ·
                Штрихкод ({dish.barcodeSourceEffective}): {dish.barcodeValue || '—'}
              </div>

              <div style={{ marginTop: 14 }}>
                <WarningsPanel warnings={dish.warnings} />
              </div>

              <label className="fld">Количество этикеток (1–999)</label>
              <QuantityStepper value={qty} onChange={setQty} />

              <div style={{ marginTop: 18 }}>
                <button className="btn primary big" disabled={busy} onClick={() => doPrint(false)}>
                  {busy ? <span className="spinner" /> : '🖨'} Печать {qty > 1 ? `${qty} этикеток` : 'этикетки'}
                </button>
              </div>

              {result && (
                <div
                  className={
                    'banner ' + (result.kind === 'ok' ? 'ok' : result.kind === 'err' ? 'err' : 'warn')
                  }
                  style={{ marginTop: 12 }}
                >
                  {result.text}
                  {result.note && <div style={{ marginTop: 6, fontSize: 12 }}>{result.note}</div>}
                </div>
              )}
            </div>
          )}

          {!dish && (
            <p className="muted" style={{ marginTop: 20 }}>
              Начните вводить название, код или артикул. Список пуст? Импортируйте Excel в разделе{' '}
              <Link to="/admin/import">Администратор → Импорт</Link>.
            </p>
          )}
        </div>

        {labelData && <LabelPreview data={labelData} rp={rp} />}
      </div>

      {confirm && (
        <div className="modal-bg" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Печатать с незаполненными данными?</h2>
            <div className="warns" style={{ marginBottom: 16 }}>
              {confirm.warnings.map((w) => (
                <div className="warn-item" key={w.code}>
                  <span>⚠️</span>
                  <span>{w.text}</span>
                </div>
              ))}
            </div>
            <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
              <Link className="btn" to={`/admin/dishes?edit=${dish?.id}`}>
                Заполнить в админке
              </Link>
              <button className="btn" onClick={() => setConfirm(null)}>
                Отмена
              </button>
              <button className="btn primary" disabled={busy} onClick={() => doPrint(true)}>
                Печатать всё равно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
