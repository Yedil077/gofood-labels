import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { renderTest } from '../../label/renderBrowser';
import { getToken, setToken } from '../../config';
import type { Settings } from '../../types';

const minToHHMM = (m: number) =>
  `${String(Math.floor((m || 0) / 60)).padStart(2, '0')}:${String((m || 0) % 60).padStart(2, '0')}`;
const hhmmToMin = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export default function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [agent, setAgent] = useState<{ online: boolean; agent: any } | null>(null);
  const [saved, setSaved] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [ceText, setCeText] = useState('');
  const [ceErr, setCeErr] = useState('');
  const [tok, setTok] = useState(getToken());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    api.getSettings().then((r) => {
      setS(r.settings);
      setCeText(JSON.stringify(r.settings.datetime?.controlExamples ?? [], null, 2));
    });
    api.agentInfo().then(setAgent).catch(() => setAgent(null));
  }, []);

  useEffect(() => {
    if (s && canvasRef.current) {
      renderTest(canvasRef.current, {
        widthMm: Number(s['label.widthMm']) || 100,
        heightMm: Number(s['label.heightMm']) || 70,
        dpi: Number(s['label.dpi']) || 300,
        safeMm: Number(s['label.safeMm']) || 3,
        symbology: s['barcode.symbology'] || 'code128',
        brandColor: s['brand.primaryColor'],
      });
    }
  }, [s]);

  if (!s) return <p className="muted">Загрузка…</p>;
  const set = (k: string, v: any) => setS({ ...s, [k]: v });
  const setDt = (k: string, v: any) => setS({ ...s, datetime: { ...s.datetime, [k]: v } });
  const printers: string[] = agent?.agent?.printers || [];

  async function saveAll() {
    setCeErr('');
    let controlExamples;
    try {
      controlExamples = JSON.parse(ceText);
    } catch {
      setCeErr('Контрольные примеры: некорректный JSON');
      return;
    }
    const dtClean = Object.fromEntries(
      Object.entries(s!.datetime || {}).filter(([k]) => !k.startsWith('_'))
    );
    const patch: Record<string, any> = {
      'printer.name': s!['printer.name'],
      'printer.dryRun': !!s!['printer.dryRun'],
      'print.copiesMode': s!['print.copiesMode'],
      'print.scale': s!['print.scale'],
      'label.widthMm': Number(s!['label.widthMm']) || 100,
      'label.heightMm': Number(s!['label.heightMm']) || 70,
      'label.dpi': Number(s!['label.dpi']) || 300,
      'label.printRotationDeg': Number(s!['label.printRotationDeg']) || 0,
      'label.safeMm': Number(s!['label.safeMm']) || 3,
      'barcode.defaultSource': s!['barcode.defaultSource'],
      'barcode.symbology': s!['barcode.symbology'],
      'barcode.showText': !!s!['barcode.showText'],
      'brand.name': s!['brand.name'],
      'brand.primaryColor': s!['brand.primaryColor'],
      'brand.tagline': s!['brand.tagline'],
      'brand.fontScale': Number(s!['brand.fontScale']) || 1,
      'storage.text': s!['storage.text'],
      datetime: { ...dtClean, controlExamples },
    };
    const r = await api.saveSettings(patch);
    if ((r as any)._status >= 400) {
      setSaved('Ошибка: ' + ((r as any).error || 'нет прав (укажите токен администратора ниже)'));
      return;
    }
    setS(r.settings);
    setSaved('Сохранено ✓');
    setTimeout(() => setSaved(''), 2500);
  }

  async function testPrint() {
    setTestMsg('Создание задания…');
    try {
      const r: any = await api.testPrint(1);
      setTestMsg(
        r.ok
          ? `Задание #${r.jobId} создано. Агент напечатает тестовую этикетку.`
          : 'Ошибка: ' + (r.error || 'нет прав')
      );
    } catch (e: any) {
      setTestMsg('Ошибка: ' + String(e?.message || e));
    }
  }

  return (
    <div>
      {/* --- Доступ администратора --- */}
      <div className="card">
        <h2>Доступ администратора</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Пароль нужен <b>только на этой странице</b> — импорт Excel, правка блюд, настройки, тестовая
          печать. <b>Работникам кухни вводить ничего не нужно</b> — экран «Печать» работает сам.
        </p>
        <label className="fld">Пароль администратора</label>
        <input
          type="password"
          value={tok}
          placeholder="значение GOFOOD_TOKEN из Netlify → Environment variables"
          style={{ maxWidth: 420 }}
          onChange={(e) => {
            setTok(e.target.value);
            setToken(e.target.value);
          }}
        />
        <p className="muted" style={{ fontSize: 12 }}>
          Сохраняется только в этом браузере. Если в Netlify переменная не задана — пароль не нужен.
        </p>
        <div
          className="banner"
          style={{
            marginTop: 12,
            background: agent?.online ? '#eef8f0' : '#fdeeee',
            border: '1px solid ' + (agent?.online ? '#bfe3c6' : '#f0c4c4'),
          }}
        >
          Print Agent: {agent?.online ? '🟢 на связи' : '🔴 не отвечает'}
          {agent?.agent && (
            <>
              {' '}· {agent.agent.platform} · принтеров: {agent.agent.printers?.length ?? 0}
              {agent.agent.at && ` · ${new Date(agent.agent.at).toLocaleTimeString('ru-RU')}`}
            </>
          )}
        </div>
      </div>

      {/* --- Принтер --- */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Принтер и печать</h2>
        <div className="split2">
          <div>
            <label className="fld">Принтер (из списка агента)</label>
            <select value={s['printer.name']} onChange={(e) => set('printer.name', e.target.value)}>
              <option value="">— по умолчанию в системе</option>
              {printers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              {s['printer.name'] && !printers.includes(s['printer.name']) && (
                <option value={s['printer.name']}>{s['printer.name']}</option>
              )}
            </select>
            <p className="muted" style={{ fontSize: 12 }}>
              Выберите драйвер <b>EPSON CW-C4030</b>. Масштаб — <span className="mono">noscale</span>.
            </p>
          </div>
          <div>
            <label className="fld">Масштаб печати</label>
            <select value={s['print.scale']} onChange={(e) => set('print.scale', e.target.value)}>
              <option value="noscale">noscale — 1:1 (рекомендуется)</option>
              <option value="fit">fit</option>
              <option value="shrink">shrink</option>
            </select>
            <label className="fld">Несколько копий</label>
            <select value={s['print.copiesMode']} onChange={(e) => set('print.copiesMode', e.target.value)}>
              <option value="pages">N страниц в задании</option>
              <option value="driver">copies=N в драйвере</option>
            </select>
          </div>
        </div>
        <label className="row" style={{ gap: 8, marginTop: 10 }}>
          <input type="checkbox" checked={!!s['printer.dryRun']} onChange={(e) => set('printer.dryRun', e.target.checked)} />
          Тест-режим агента: не печатать, только сохранять PDF
        </label>
      </div>

      {/* --- Размер --- */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Размер этикетки</h2>
        <p className="muted">
          Носитель Epson: 70 мм лента × 100 мм подача. Макет альбомный: 100 × 70 мм. Драйвер ждёт
          портрет → поставьте поворот 90°.
        </p>
        <div className="row wrap">
          {[
            ['label.widthMm', 'Ширина, мм'],
            ['label.heightMm', 'Высота, мм'],
            ['label.dpi', 'DPI'],
            ['label.safeMm', 'Поле, мм'],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="fld">{label}</label>
              <input type="number" value={s[k]} onChange={(e) => set(k, e.target.value)} style={{ width: 100 }} />
            </div>
          ))}
          <div>
            <label className="fld">Поворот при печати</label>
            <select
              value={s['label.printRotationDeg']}
              onChange={(e) => set('label.printRotationDeg', Number(e.target.value))}
            >
              {[0, 90, 180, 270].map((d) => (
                <option key={d} value={d}>{d}°</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* --- Штрихкод --- */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Штрихкод</h2>
        <div className="split2">
          <div>
            <label className="fld">Источник по умолчанию</label>
            <select value={s['barcode.defaultSource']} onChange={(e) => set('barcode.defaultSource', e.target.value)}>
              <option value="ean13">EAN-13 из Артикула (как на кассе)</option>
              <option value="code">Код (из Excel)</option>
              <option value="artikul">Артикул (из Excel)</option>
            </select>
            <p className="muted" style={{ fontSize: 12 }}>
              EAN-13 вычисляется по формуле <span className="mono">21 + Артикул + 00001 + к.ц.</span> и
              совпадает со штрихкодом в кассе/iiko (проверено на 464 позициях).
            </p>
          </div>
          <div>
            <label className="fld">Символика</label>
            <select value={s['barcode.symbology']} onChange={(e) => set('barcode.symbology', e.target.value)}>
              <option value="code128">CODE128</option>
              <option value="code39">CODE39</option>
              <option value="ean13">EAN-13</option>
              <option value="qrcode">QR (только через агента)</option>
            </select>
          </div>
        </div>
        <label className="row" style={{ gap: 8, marginTop: 10 }}>
          <input type="checkbox" checked={!!s['barcode.showText']} onChange={(e) => set('barcode.showText', e.target.checked)} />
          Показывать цифры под штрихкодом
        </label>
        <p className="muted" style={{ fontSize: 12 }}>Коды из Excel не изменяются и не генерируются случайно.</p>
      </div>

      {/* --- Оформление --- */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Оформление и тексты</h2>
        <div className="split2">
          <div>
            <label className="fld">Бренд</label>
            <input value={s['brand.name']} onChange={(e) => set('brand.name', e.target.value)} />
            <label className="fld">Фирменный цвет</label>
            <input type="text" value={s['brand.primaryColor']} onChange={(e) => set('brand.primaryColor', e.target.value)} />
            <label className="fld">Масштаб шрифта</label>
            <input type="number" step="0.05" value={s['brand.fontScale']} onChange={(e) => set('brand.fontScale', e.target.value)} />
          </div>
          <div>
            <label className="fld">Слоган</label>
            <input value={s['brand.tagline']} onChange={(e) => set('brand.tagline', e.target.value)} />
            <label className="fld">Условия хранения</label>
            <textarea value={s['storage.text']} onChange={(e) => set('storage.text', e.target.value)} />
          </div>
        </div>
      </div>

      {/* --- Дата/время --- */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Дата/время на этикетке</h2>
        <div className="banner warn">
          Правило <b>времени</b> из 6 контрольных примеров ТЗ однозначно не выводится — оно не
          придумано. Точные значения даёт таблица ниже; для прочих моментов время помечается
          приблизительным. Правило <b>даты</b> (смена в 09:00) работает всегда.
        </div>
        <div className="row wrap">
          <div>
            <label className="fld">Дата на этикетке</label>
            <select
              value={s.datetime?.dateMode ?? 'shift'}
              onChange={(e) => setDt('dateMode', e.target.value)}
            >
              <option value="shift">смена: после времени ниже → следующий день</option>
              <option value="today">всегда сегодняшняя дата</option>
            </select>
          </div>
          <div>
            <label className="fld">Смена → след. день в</label>
            <input
              type="text"
              defaultValue={minToHHMM(s.datetime?.shiftCutoffMin ?? 540)}
              onBlur={(e) => {
                const m = hhmmToMin(e.target.value);
                if (m != null) setDt('shiftCutoffMin', m);
              }}
              style={{ width: 110 }}
              disabled={(s.datetime?.dateMode ?? 'shift') === 'today'}
            />
          </div>
          <div>
            <label className="fld">Часовой пояс кухни, мин от UTC</label>
            <input
              type="number"
              value={s.datetime?.tzOffsetMin ?? 300}
              onChange={(e) => setDt('tzOffsetMin', Number(e.target.value))}
              style={{ width: 130 }}
            />
          </div>
          <div>
            <label className="fld">Запасное время</label>
            <select
              value={s.datetime?.timeFallback?.mode ?? 'fixed'}
              onChange={(e) =>
                setDt('timeFallback', { ...(s.datetime?.timeFallback ?? {}), mode: e.target.value, valueMin: s.datetime?.timeFallback?.valueMin ?? 0 })
              }
            >
              <option value="fixed">фиксированное</option>
              <option value="passthrough">реальное время часов</option>
            </select>
          </div>
          {(s.datetime?.timeFallback?.mode ?? 'fixed') === 'fixed' && (
            <div>
              <label className="fld">Значение</label>
              <input
                type="text"
                defaultValue={minToHHMM(s.datetime?.timeFallback?.valueMin ?? 0)}
                onBlur={(e) => {
                  const m = hhmmToMin(e.target.value);
                  if (m != null) setDt('timeFallback', { ...(s.datetime?.timeFallback ?? {}), mode: 'fixed', valueMin: m });
                }}
                style={{ width: 110 }}
              />
            </div>
          )}
        </div>

        <label className="fld">Контрольные примеры (точное совпадение → точный вывод), JSON</label>
        <textarea className="mono" style={{ minHeight: 190 }} value={ceText} onChange={(e) => setCeText(e.target.value)} />
        {ceErr && <div className="banner err">{ceErr}</div>}
        <p className="muted" style={{ fontSize: 12 }}>
          Формат: <span className="mono">{'{ "in": "YYYY-MM-DD HH:mm", "out": "YYYY-MM-DD HH:mm" }'}</span>.
        </p>
      </div>

      <div className="row" style={{ marginTop: 18, position: 'sticky', bottom: 12 }}>
        <button className="btn primary" onClick={saveAll}>Сохранить настройки</button>
        {saved && <span className={'tag ' + (saved.startsWith('Ошибка') ? 'err' : 'ok')}>{saved}</span>}
      </div>

      {/* --- Тестовая печать --- */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Тестовая печать</h2>
        <p className="muted">
          Калибровочная этикетка: линейка, стрелка подачи, тестовый штрихкод. Проверьте размер,
          ориентацию, обрезку, качество штрихкода.
        </p>
        <div
          className="preview-frame"
          style={{ width: 360, aspectRatio: `${s['label.widthMm']} / ${s['label.heightMm']}` }}
        >
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={testPrint}>🖨 Отправить тестовую печать</button>
          {testMsg && <span className="muted">{testMsg}</span>}
        </div>
      </div>
    </div>
  );
}
