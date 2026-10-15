import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DishSearch from '../components/DishSearch';
import QuantityStepper from '../components/QuantityStepper';
import WeightStepper from '../components/WeightStepper';
import LabelPreview from '../components/LabelPreview';
import WarningsPanel from '../components/WarningsPanel';
import AgentStatus from '../components/AgentStatus';
import { api } from '../api';
import { useQueue } from '../useQueue';
import { getLabelSizeId, setLabelSizeId, getPrintVariantId, setPrintVariantId } from '../config';
// @ts-ignore
import { getProfiles, profileById, labelSizeFor } from '../shared/labelSizes.js';
// @ts-ignore
import { PRINT_VARIANTS, printVariantById } from '../shared/printVariants.js';
// @ts-ignore
import { calculateLabelDateTime, localKey } from '../shared/labelDateTime.js';
// @ts-ignore
import { normalizeDishForLabel } from '../shared/normalize.js';
// @ts-ignore
import { groupOf, buildTree } from '../shared/categories.js';
// @ts-ignore
import { calcPrintRun, blankEnabledFrom } from '../shared/printRun.js';
// @ts-ignore
import { STATUS_TEXT } from '../shared/printQueue.js';
import { printViaBrowser } from '../label/printBrowser';
import type { Dish, Settings, PrintJob } from '../types';

type View = 'groups' | 'dishes' | 'dish';

/** Сегодня по местному времени кухни (часы этого компьютера). */
function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
/** 1 раз, 2 раза, 5 раз */
function razWord(n: number) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  return b >= 2 && b <= 4 && (a < 12 || a > 14) ? 'раза' : 'раз';
}
// что считается «уже напечатано» (отменённое и ошибки — нет)
const NOT_PRINTED = new Set(['cancelled', 'error']);
const kitchenUser = () => {
  try {
    return localStorage.getItem('kitchenUser') || 'kitchen';
  } catch {
    return 'kitchen';
  }
};
// последнее количество по блюду — удобно для повторяющихся тиражей
function lastQty(id: number) {
  try {
    return Number(JSON.parse(localStorage.getItem('lastQty') || '{}')[id]) || 1;
  } catch {
    return 1;
  }
}
function saveQty(id: number, q: number) {
  try {
    const m = JSON.parse(localStorage.getItem('lastQty') || '{}');
    m[id] = q;
    localStorage.setItem('lastQty', JSON.stringify(m));
  } catch {
    /* no-op */
  }
}

export default function PrintPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [view, setView] = useState<View>('groups');
  const [selGroup, setSelGroup] = useState('');
  const [selSub, setSelSub] = useState('');
  const [dish, setDish] = useState<Dish | null>(null);
  const [qty, setQty] = useState(1);
  const [weight, setWeight] = useState('');
  const [dietOverride, setDietOverride] = useState<'auto' | 'pp' | 'classic'>('auto');
  // размер и вариант — запоминаются в браузере
  const [sizeId, setSizeId] = useState<string>(getLabelSizeId);
  const [variantId, setVariantId] = useState<string>(getPrintVariantId);
  const variant = printVariantById(variantId);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<null | { kind: 'ok' | 'err' | 'warn'; text: string }>(null);
  const [confirm, setConfirm] = useState<null | { warnings: { code: string; text: string }[] }>(null);
  const { info: queue, error: queueErr, reload: reloadQueue } = useQueue(5000);

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => {});
    api.listDishes('', false).then((r) => setDishes(r.dishes)).catch(() => {});
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  // история печати за сегодня (все устройства) — чтобы не напечатать одно и то же дважды
  const [history, setHistory] = useState<PrintJob[]>([]);
  function loadHistory() {
    api
      .history(500)
      .then((r) => setHistory((r.jobs || []).filter((j) => j.kind === 'label' && isToday(j.createdAt))))
      .catch(() => {});
  }
  useEffect(() => {
    loadHistory();
    const id = setInterval(loadHistory, 20000);
    return () => clearInterval(id);
  }, []);

  const dtCfg = settings?.datetime;
  const dt = useMemo(() => (dtCfg ? calculateLabelDateTime(localKey(now), dtCfg) : null), [dtCfg, now]);

  const size =
    profileById(settings, sizeId) ||
    labelSizeFor(Number(settings?.['label.widthMm']) || 80, Number(settings?.['label.heightMm']) || 50, settings);
  function chooseSize(id: string) {
    setSizeId(id);
    setLabelSizeId(id);
  }

  const rp = useMemo(
    () => ({
      widthMm: size.widthMm,
      heightMm: size.heightMm,
      dpi: Number(settings?.['label.dpi']) || 300,
      safeMm: Number(settings?.['label.safeMm']) || 3,
      symbology: settings?.['barcode.symbology'] || 'code128',
      brandColor: settings?.['brand.primaryColor'] || '#F2661F',
    }),
    [settings, size.widthMm, size.heightMm]
  );

  const tree = useMemo(() => buildTree(dishes), [dishes]);
  const currentSubs = useMemo(() => tree.find((g: any) => g.group === selGroup)?.subs ?? [], [tree, selGroup]);
  const dishesInView = useMemo(() => {
    let list = dishes.filter((d) => groupOf(d.category).group === selGroup);
    if (selSub) list = list.filter((d) => groupOf(d.category).sub === selSub);
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [dishes, selGroup, selSub]);

  const labelData = useMemo(() => {
    if (!settings || !dt || !dish) return null;
    return normalizeDishForLabel(dish, settings, dt, { shelfHours: variant.shelfHours });
  }, [dish, settings, dt, variant.shelfHours]);

  // вес — из таблицы категорий, тип питания — авто; можно поправить на этот тираж
  useEffect(() => {
    setWeight(labelData?.weight || '');
    setDietOverride('auto');
  }, [dish?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dietTypeLabelFull =
    dietOverride === 'pp' ? 'Правильное питание' : dietOverride === 'classic' ? 'Классическое питание' : labelData?.dietTypeLabelFull;
  const dietType = dietOverride === 'auto' ? labelData?.dietType : dietOverride;
  const printData = useMemo(
    () => (labelData ? { ...labelData, weight, dietType, dietTypeLabelFull } : null),
    [labelData, weight, dietType, dietTypeLabelFull]
  );
  // пустая этикетка в конце — по настройке администратора, на экране не показываем
  const run = calcPrintRun(qty, blankEnabledFrom(settings));

  const doneToday = useMemo(
    () => (dish ? history.filter((j) => j.dish?.id === dish.id && !NOT_PRINTED.has(j.status)) : []),
    [history, dish]
  );
  const doneTodayQty = doneToday.reduce((a, j) => a + (Number(j.quantity) || 0), 0);
  const online = !!queue?.online;

  function openGroup(g: string) {
    setSelGroup(g);
    setSelSub('');
    setView('dishes');
  }
  function openDish(d: Dish) {
    setDish(d);
    setQty(lastQty(d.id));
    setView('dish');
  }
  function backToGroups() {
    setView('groups');
    setDish(null);
  }
  function confirmRepeat() {
    if (!doneToday.length) return true;
    return window.confirm(`«${dish?.name}» сегодня уже печатали: ${doneTodayQty} шт. Напечатать ещё ${qty} шт.?`);
  }

  /** Главный путь: задание в общую очередь → Print Agent печатает сам. */
  async function toQueue(ignoreWarnings = false) {
    if (!dish) return;
    if (!ignoreWarnings && !confirmRepeat()) return;
    setBusy(true);
    try {
      const r: any = await api.print({
        dishId: dish.id,
        quantity: qty,
        weight: weight || undefined,
        dietType: dietOverride === 'auto' ? undefined : dietOverride,
        labelSize: size.id,
        variant: variant.id,
        ignoreWarnings,
        clientLocal: localKey(new Date()),
        user: kitchenUser(),
      });
      if (r._status === 409 && r.needsConfirm) {
        setConfirm({ warnings: r.warnings || [] });
        return;
      }
      if (r.ok) {
        setConfirm(null);
        saveQty(dish.id, qty);
        const ahead = Math.max(0, (queue?.pending || 0));
        setToast({
          kind: online ? 'ok' : 'warn',
          text: online
            ? `В очереди: «${dish.name}» — ${r.filled} шт.${ahead ? ` Перед ним заданий: ${ahead}.` : ' Печатается первым.'}`
            : `«${dish.name}» в очереди, но агент не на связи — печать начнётся, когда его запустят.`,
        });
        reloadQueue();
        loadHistory();
      } else {
        setToast({ kind: 'err', text: r.error || 'Не удалось поставить в очередь' });
      }
    } catch (e: any) {
      setToast({ kind: 'err', text: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  /** Запасной путь: окно печати браузера (пустая этикетка — последней страницей того же документа). */
  function viaBrowser() {
    if (!printData || !dish) return;
    if (!confirmRepeat()) return;
    printViaBrowser(printData, rp as any, run.filled, run.blank);
    saveQty(dish.id, qty);
    api
      .logPrint({
        dishId: dish.id,
        quantity: qty,
        labelDate: printData.dateStr,
        labelTime: printData.timeStr,
        labelSize: size.id,
        variant: variant.id,
        user: kitchenUser(),
      })
      .then(loadHistory)
      .catch(() => {});
  }

  /* ------------------------------- РЕНДЕР ------------------------------- */

  const totalToday = history.filter((j) => !NOT_PRINTED.has(j.status));
  const recentQueue = (queue?.jobs || []).filter((j) => ['queued', 'sending', 'printing', 'error', 'uncertain'].includes(j.status)).slice(0, 4);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Печать этикеток</h1>
          {dt && (
            <span className="muted small">
              Дата на этикетке: <b>{labelData?.dateStr || dt.date}</b>
              {labelData?.timeStr ? `, время ${labelData.timeStr}` : ''}
            </span>
          )}
        </div>
        <AgentStatus info={queue} error={queueErr} compact />
      </div>

      {/* Поиск доступен всегда */}
      <div className="card search-card">
        <DishSearch
          onPick={(d) => {
            setSelGroup(groupOf(d.category).group);
            setSelSub('');
            openDish(d);
          }}
        />
      </div>

      {view === 'groups' &&
        (!dishes.length ? (
          <div className="card muted">
            Список блюд пуст. Импортируйте Excel в разделе <Link to="/admin/import">Администратор → Импорт</Link>.
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
        ))}

      {view === 'dishes' && (
        <>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn" onClick={backToGroups}>← Категории</button>
            <h2 style={{ margin: 0 }}>{selGroup}</h2>
          </div>
          {currentSubs.length > 0 && (
            <div className="chips">
              <button className={'chip' + (selSub === '' ? ' active' : '')} onClick={() => setSelSub('')}>Все</button>
              {currentSubs.map((s: any) => (
                <button key={s.sub} className={'chip' + (selSub === s.sub ? ' active' : '')} onClick={() => setSelSub(s.sub)}>
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
        <div className="print-layout fade-in">
          {/* превью: справа на компьютере, сразу после поиска на телефоне */}
          <aside className="pl-preview">
            {printData && <LabelPreview data={printData} rp={rp} />}
          </aside>

          <section className="pl-params card">
            <button className="btn ghost back" onClick={() => (selGroup ? setView('dishes') : backToGroups())}>
              ← Назад
            </button>
            <div className="dish-title">{dish.name}</div>
            <div className="muted small">
              {dish.category || 'без категории'} · Код {dish.code || '—'}
            </div>

            {doneToday.length > 0 && (
              <div className="banner warn" style={{ marginTop: 12 }}>
                <b>Сегодня уже печатали: {doneTodayQty} шт.</b>{' '}
                ({doneToday.map((j) => `${hhmm(j.createdAt)} — ${j.quantity} шт.`).join(', ')})
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <WarningsPanel warnings={dish.warnings} />
            </div>

            <label className="fld">Количество</label>
            <QuantityStepper value={qty} onChange={setQty} />

            <label className="fld">Размер этикетки</label>
            <div className="chips">
              {getProfiles(settings).filter((p: any) => p.enabled || p.id === size.id).map((s: any) => (
                <button key={s.id} className={'chip' + (size.id === s.id ? ' active' : '')} onClick={() => chooseSize(s.id)}>
                  {s.title}
                </button>
              ))}
            </div>

            <div className="split2 params-2">
              <div>
                <label className="fld">Вес порции</label>
                <WeightStepper value={weight} onChange={setWeight} placeholder="например, 200 г" />
              </div>
              <div>
                <label className="fld">Вариант</label>
                <div className="chips">
                  {PRINT_VARIANTS.map((v: any) => (
                    <button
                      key={v.id}
                      className={'chip' + (variant.id === v.id ? ' active' : '')}
                      onClick={() => {
                        setVariantId(v.id);
                        setPrintVariantId(v.id);
                      }}
                    >
                      {v.title}
                      {v.shelfHours ? <span className="muted"> · {v.shelfHours} ч</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {labelData?.showDietType && (
              <>
                <label className="fld">Категория питания</label>
                <div className="chips">
                  <button className={'chip' + (dietOverride === 'auto' ? ' active' : '')} onClick={() => setDietOverride('auto')}>
                    Авто <span className="muted">({labelData?.dietTypeLabel})</span>
                  </button>
                  <button className={'chip' + (dietOverride === 'classic' ? ' active' : '')} onClick={() => setDietOverride('classic')}>
                    Классическое питание
                  </button>
                  <button className={'chip' + (dietOverride === 'pp' ? ' active' : '')} onClick={() => setDietOverride('pp')}>
                    Правильное питание
                  </button>
                </div>
              </>
            )}

            {(() => {
              // совпадает ли выбранный размер с рулоном в Epson и можно ли печатать сразу
              const roll = queue?.roll;
              if (!roll || !online) return null;
              const rollTitle = profileById(settings, roll.id)?.title || roll.id;
              if (roll.id !== size.id)
                return (
                  <div className="banner warn" style={{ marginTop: 16 }}>
                    <b>В Epson сейчас рулон {rollTitle}.</b> Задание {size.title} встанет в очередь и будет ждать, пока
                    не заменят рулон и не отметят это на странице «Очередь».
                  </div>
                );
              if (!size.ready)
                return (
                  <div className="banner warn" style={{ marginTop: 16 }}>
                    Профиль «{size.title}» не проверен на рулоне — автопечать выключена. Задание будет ждать; можно
                    напечатать «Через браузер».
                  </div>
                );
              if (queue?.canPrint === false)
                return <div className="banner warn" style={{ marginTop: 16 }}>Печать сейчас не пойдёт: {queue.blockedReason}</div>;
              return (
                <div className="banner ok" style={{ marginTop: 16 }}>
                  Рулон {rollTitle} установлен — печать начнётся сразу{queue?.pending ? ` после ${queue.pending} зад. в очереди` : ''}.
                </div>
              );
            })()}

            <div className="actions">
              {online ? (
                <>
                  <button className="btn primary big" disabled={busy} onClick={() => toQueue(false)}>
                    {busy ? <span className="spinner" /> : '🖨'} ПЕЧАТЬ{qty > 1 ? ` · ${qty} шт.` : ''}
                  </button>
                  <button className="btn" onClick={viaBrowser} title="Окно печати браузера на этом компьютере">
                    Через браузер
                  </button>
                  <div className="muted small">Задание уйдёт в общую очередь, принтер напечатает сам.</div>
                </>
              ) : (
                <>
                  <button className="btn primary big" onClick={viaBrowser}>
                    🖨 ПЕЧАТЬ{qty > 1 ? ` · ${qty} шт.` : ''}
                  </button>
                  <button className="btn" disabled={busy} onClick={() => toQueue(false)} title="Напечатается, когда запустят Print Agent">
                    {busy ? <span className="spinner" /> : null} В очередь (агент не на связи)
                  </button>
                  <div className="muted small">
                    Откроется окно печати: принтер EPSON CW-C4030, «Поля» — нет, «Масштаб» — 100 %.
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="pl-queue card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>Очередь</h2>
              <Link to="/queue" className="small">Вся очередь →</Link>
            </div>
            {recentQueue.length ? (
              <div className="mini-queue">
                {recentQueue.map((j) => (
                  <div key={j.id} className="mini-q-row">
                    <span className="mini-q-name">{j.dish_name}</span>
                    <span className="muted small">{j.filled} шт.</span>
                    <span className={'tag ' + (j.status === 'error' || j.status === 'uncertain' ? 'err' : j.status === 'queued' ? 'muted' : 'warn')}>
                      {STATUS_TEXT[j.status] || j.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small" style={{ margin: '8px 0 0' }}>Очередь пуста.</p>
            )}
          </section>
        </div>
      )}

      {/* История печати за сегодня — со всех устройств */}
      <div className="card">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>
            Сегодня напечатано{' '}
            <span className="muted" style={{ fontSize: 14 }}>
              · {totalToday.length} {razWord(totalToday.length)}, {totalToday.reduce((a, j) => a + (Number(j.quantity) || 0), 0)} шт.
            </span>
          </h2>
          <button className="btn small" onClick={loadHistory}>Обновить</button>
        </div>
        {!history.length ? (
          <p className="muted">Сегодня ещё ничего не печатали.</p>
        ) : (
          <div className="table-scroll">
            <table style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Время</th><th>Блюдо</th><th>Кол-во</th><th>На этикетке</th><th>Размер</th><th>Статус</th><th></th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 200).map((j) => {
                  const d = dishes.find((x) => x.id === j.dish?.id);
                  return (
                    <tr key={String(j.id)}>
                      <td className="mono">{hhmm(j.createdAt)}</td>
                      <td>
                        {j.dish?.name}
                        {j.variant === 'aidar' && <span className="tag muted"> Айдар</span>}
                      </td>
                      <td><b>{j.quantity}</b></td>
                      <td className="mono">{j.labelDate} {j.labelTime}</td>
                      <td className="muted">{profileById(settings, j.labelSize || '')?.title || '—'}</td>
                      <td className="muted small">{STATUS_TEXT[j.status] || j.status}</td>
                      <td className="right">
                        {d && (
                          <button
                            className="btn small"
                            onClick={() => {
                              setSelGroup(groupOf(d.category).group);
                              setSelSub('');
                              openDish(d);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            Открыть
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <div className={'toast ' + toast.kind}>{toast.text}</div>}

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
              <button className="btn primary" disabled={busy} onClick={() => toQueue(true)}>
                Печатать всё равно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
