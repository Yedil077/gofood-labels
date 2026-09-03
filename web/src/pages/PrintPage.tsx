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
// @ts-ignore
import { groupOf, buildTree } from '../shared/categories.js';
import type { Dish, Settings } from '../types';

type View = 'groups' | 'dishes' | 'dish';

export default function PrintPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [view, setView] = useState<View>('groups');
  const [selGroup, setSelGroup] = useState('');
  const [selSub, setSelSub] = useState('');
  const [dish, setDish] = useState<Dish | null>(null);
  const [qty, setQty] = useState(1);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { kind: 'ok' | 'err' | 'wait'; text: string; note?: string }>(null);
  const [confirm, setConfirm] = useState<null | { warnings: { code: string; text: string }[] }>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => {});
    api.listDishes('', false).then((r) => setDishes(r.dishes)).catch(() => {});
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const dtCfg = settings?.datetime;
  const dt = useMemo(() => (dtCfg ? calculateLabelDateTime(localKey(now), dtCfg) : null), [dtCfg, now]);

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

  const tree = useMemo(() => buildTree(dishes), [dishes]);
  const currentSubs = useMemo(
    () => tree.find((g: any) => g.group === selGroup)?.subs ?? [],
    [tree, selGroup]
  );
  const dishesInView = useMemo(() => {
    let list = dishes.filter((d) => groupOf(d.category).group === selGroup);
    if (selSub) list = list.filter((d) => groupOf(d.category).sub === selSub);
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [dishes, selGroup, selSub]);

  const labelData = useMemo(() => {
    if (!settings || !dt || !dish) return null;
    return normalizeDishForLabel(dish, settings, dt);
  }, [dish, settings, dt]);

  function openGroup(g: string) {
    setSelGroup(g);
    setSelSub('');
    setView('dishes');
  }
  function openDish(d: Dish) {
    setDish(d);
    setQty(1);
    setResult(null);
    setView('dish');
  }
  function backToGroups() {
    setView('groups');
    setDish(null);
    setResult(null);
  }

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
          text: `Задание создано (${qty} шт., ${r.labelDate} ${r.labelTime}). Печатается…`,
          note: r.approximateTime ? 'Время рассчитано приблизительно.' : undefined,
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
          setResult(
            j.status === 'error'
              ? { kind: 'err', text: `Ошибка печати: ${j.error || 'см. логи'}` }
              : {
                  kind: 'ok',
                  text:
                    j.status === 'dry-run'
                      ? 'Агент в тест-режиме — PDF сохранён, не напечатано.'
                      : 'Напечатано ✓',
                }
          );
        }
      } catch {
        /* keep polling */
      }
      if (tries > 20) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setResult((cur) =>
          cur?.kind === 'wait'
            ? { kind: 'err', text: 'Агент печати не ответил. Проверьте, что Print Agent запущен на ПК с принтером.' }
            : cur
        );
      }
    }, 2000);
  }

  /* ------------------------------- РЕНДЕР ------------------------------- */

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ marginBottom: 4 }}>Печать этикеток</h1>
        {dt && (
          <span className={'tag ' + (dt.approximate ? 'warn' : 'ok')}>
            на этикетке: {dt.date} {dt.time}
          </span>
        )}
      </div>

      {/* Поиск доступен всегда */}
      <div className="card" style={{ marginBottom: 16 }}>
        <DishSearch
          onPick={(d) => {
            const g = groupOf(d.category);
            setSelGroup(g.group);
            setSelSub('');
            openDish(d);
          }}
        />
      </div>

      {view === 'groups' && (
        <>
          {!dishes.length ? (
            <div className="card muted">
              Список блюд пуст. Импортируйте Excel в разделе{' '}
              <Link to="/admin/import">Администратор → Импорт</Link>.
            </div>
          ) : (
            <div className="pick-grid">
              {tree.map((g: any) => (
                <button key={g.group} className="pick-tile" onClick={() => openGroup(g.group)}>
                  <span className="pick-ic">{g.icon}</span>
                  <span className="pick-name">{g.group}</span>
                  <span className="pick-count">{g.count}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'dishes' && (
        <>
          <div className="row" style={{ marginBottom: 12, gap: 10 }}>
            <button className="btn" onClick={backToGroups}>← Категории</button>
            <h2 style={{ margin: 0 }}>{selGroup}</h2>
          </div>

          {currentSubs.length > 0 && (
            <div className="chips" style={{ marginBottom: 14 }}>
              <button
                className={'chip' + (selSub === '' ? ' active' : '')}
                onClick={() => setSelSub('')}
              >
                Все
              </button>
              {currentSubs.map((s: any) => (
                <button
                  key={s.sub}
                  className={'chip' + (selSub === s.sub ? ' active' : '')}
                  onClick={() => setSelSub(s.sub)}
                >
                  {s.sub} <span className="muted">{s.count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="dish-grid">
            {dishesInView.map((d) => (
              <button key={d.id} className="dish-tile" onClick={() => openDish(d)}>
                <span className="dish-name">{d.name}</span>
                <span className="dish-meta">
                  Код {d.code || '—'}
                  {d.warnings.length ? ` · ⚠️ ${d.warnings.length}` : ''}
                </span>
              </button>
            ))}
            {!dishesInView.length && <div className="muted">В этой категории нет блюд.</div>}
          </div>
        </>
      )}

      {view === 'dish' && dish && (
        <div className="grid-print">
          <div className="card">
            <button className="btn" onClick={() => (selGroup ? setView('dishes') : backToGroups())}>
              ← Назад
            </button>

            <div style={{ marginTop: 14, fontWeight: 800, fontSize: 20 }}>{dish.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {dish.category || 'без категории'} · Код {dish.code || '—'}
            </div>

            <div style={{ marginTop: 14 }}>
              <WarningsPanel warnings={dish.warnings} />
            </div>

            <label className="fld">Количество</label>
            <QuantityStepper value={qty} onChange={setQty} />

            <div style={{ marginTop: 18 }}>
              <button className="btn primary big" disabled={busy} onClick={() => doPrint(false)}>
                {busy ? <span className="spinner" /> : '🖨'} ПЕЧАТЬ{qty > 1 ? ` · ${qty} шт.` : ''}
              </button>
            </div>

            {result && (
              <div
                className={'banner ' + (result.kind === 'ok' ? 'ok' : result.kind === 'err' ? 'err' : 'warn')}
                style={{ marginTop: 12 }}
              >
                {result.text}
                {result.note && <div style={{ marginTop: 6, fontSize: 12 }}>{result.note}</div>}
              </div>
            )}
          </div>

          {labelData && <LabelPreview data={labelData} rp={rp} />}
        </div>
      )}

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
              <Link className="btn" to={`/admin/dishes?edit=${dish?.id}`}>Заполнить в админке</Link>
              <button className="btn" onClick={() => setConfirm(null)}>Отмена</button>
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
