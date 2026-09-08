import { useEffect, useRef, useState } from 'react';
import { api, xlsxFileToRows } from '../../api';
import type { ImportResult } from '../../types';

export default function ImportTab() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  const [batches, setBatches] = useState<any[]>([]);
  const [kbjuMsg, setKbjuMsg] = useState('');
  const [kbjuBusy, setKbjuBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const kbjuRef = useRef<HTMLInputElement>(null);

  const loadBatches = () => api.importBatches().then((r) => setBatches(r.batches || []));
  useEffect(() => {
    loadBatches();
  }, []);

  async function onFile(f: File) {
    setBusy(true);
    setErr('');
    setRes(null);
    try {
      const rows = await xlsxFileToRows(f);
      const r: any = await api.importRows(f.name, rows);
      if (r._status && r._status >= 400) throw new Error(r.error || 'Ошибка импорта');
      setRes(r);
      loadBatches();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onKbjuFile(f: File) {
    setKbjuBusy(true);
    setKbjuMsg('');
    try {
      const rows = await xlsxFileToRows(f);
      const r: any = await api.importKbju(f.name, rows);
      if (r._status && r._status >= 400) throw new Error(r.error || 'Ошибка импорта КБЖУ');
      setKbjuMsg(`Готово: обновлено ${r.matched} блюд, не найдено ${r.notFound} (из ${r.received} строк).`);
    } catch (e: any) {
      setKbjuMsg('Ошибка: ' + String(e?.message || e));
    } finally {
      setKbjuBusy(false);
      if (kbjuRef.current) kbjuRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Импорт файла блюд (.xlsx)</h2>
        <p className="muted">
          Файл читается прямо в браузере. Берутся строки <b>Тип = «Блюдо»</b>; строки «Группа» — это
          категории. Пустые ячейки не мешают. Повторный импорт обновляет данные, <b>сохраняя</b>{' '}
          состав, КБЖУ и ручные категории.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <span className="spinner" /> : '📥'} Импортировать Excel
        </button>

        {err && <div className="banner err" style={{ marginTop: 12 }}>{err}</div>}
        {res && (
          <div className="banner ok" style={{ marginTop: 12 }}>
            «{res.filename}»: <b>{res.dishesNew}</b> новых, <b>{res.dishesUpdated}</b> обновлено (всего
            блюд {res.dishesTotal}). Категорий: {res.groupsCount}. Пропущено строк: {res.skipped}.
            {res.noCategoryCount > 0 && (
              <div style={{ marginTop: 6 }}>⚠️ Без категории: {res.noCategoryCount} — задайте во вкладке «Блюда».</div>
            )}
            {res.uncertainCategoryCount > 0 && (
              <div style={{ marginTop: 6 }}>⚠️ Категория под вопросом: {res.uncertainCategoryCount}.</div>
            )}
          </div>
        )}
        {res && res.groups?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <label className="fld">Найденные категории</label>
            <div className="row wrap">
              {res.groups.map((g, i) => (
                <span key={i} className="tag muted">{g.name}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Импорт КБЖУ (.xlsx)</h2>
        <p className="muted">
          Разовая загрузка — iiko не отдаёт КБЖУ через API. Нужен Excel с колонками
          <b> «Код»</b> (или «Артикул») и <b>«Белки», «Жиры», «Углеводы», «Ккал»</b> (минимум 2 из них).
          Значения на порцию. Проставляется источник <span className="mono">import</span> —
          синхронизация с iiko эти значения не затирает.
          <br />
          Где взять: iikoOffice → Номенклатура → выделить блюда → «Экспорт в Excel» → добавить
          колонки пищевой ценности.
        </p>
        <input
          ref={kbjuRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && onKbjuFile(e.target.files[0])}
        />
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn" disabled={kbjuBusy} onClick={() => kbjuRef.current?.click()}>
            {kbjuBusy ? <span className="spinner" /> : '📥'} Импортировать КБЖУ
          </button>
          <button
            className="btn"
            disabled={kbjuBusy}
            onClick={async () => {
              if (!confirm('Удалить всё импортированное / из iiko КБЖУ у всех блюд? Введённые вручную значения останутся.')) return;
              setKbjuBusy(true);
              setKbjuMsg('');
              try {
                const r: any = await api.clearKbju();
                if (r._status >= 400) throw new Error(r.error || 'ошибка ' + r._status);
                setKbjuMsg(`Очищено КБЖУ у ${r.cleared} блюд.`);
              } catch (e: any) {
                setKbjuMsg('Ошибка: ' + String(e?.message || e));
              } finally {
                setKbjuBusy(false);
              }
            }}
          >
            🗑 Очистить всё КБЖУ
          </button>
        </div>
        {kbjuMsg && (
          <div className={'banner ' + (kbjuMsg.startsWith('Ошибка') ? 'err' : 'ok')} style={{ marginTop: 12 }}>
            {kbjuMsg}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>История импортов</h2>
        <table>
          <thead>
            <tr>
              <th>Дата</th><th>Файл</th><th>Новых</th><th>Обновлено</th><th>Групп</th><th>Пропущено</th><th>Строк</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="mono">{new Date(b.imported_at).toLocaleString('ru-RU')}</td>
                <td>{b.filename}</td>
                <td>{b.dishes_new}</td>
                <td>{b.dishes_upd}</td>
                <td>{b.groups_count}</td>
                <td>{b.skipped_count}</td>
                <td>{b.rows_total}</td>
              </tr>
            ))}
            {!batches.length && (
              <tr><td colSpan={7} className="muted">Импортов ещё не было.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
