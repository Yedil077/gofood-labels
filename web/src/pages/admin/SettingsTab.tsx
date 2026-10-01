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
  const [tokState, setTokState] = useState<'idle' | 'checking' | 'ok' | 'bad' | 'notneeded'>('idle');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // живая проверка пароля администратора (без кнопки «Сохранить»)
  useEffect(() => {
    setTokState('checking');
    const t = setTimeout(async () => {
      try {
        const r = await api.adminCheck();
        setTokState(!r.tokenRequired ? 'notneeded' : r.ok ? 'ok' : 'bad');
      } catch {
        setTokState('idle');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [tok]);

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
        widthMm: Number(s['label.widthMm']) || 80,
        heightMm: Number(s['label.heightMm']) || 50,
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
      'label.widthMm': Number(s!['label.widthMm']) || 80,
      'label.heightMm': Number(s!['label.heightMm']) || 50,
      'label.dpi': Number(s!['label.dpi']) || 300,
      'label.printRotationDeg': Number(s!['label.printRotationDeg']) || 0,
      'label.safeMm': Number(s!['label.safeMm']) || 3,
      'barcode.defaultSource': s!['barcode.defaultSource'],
      'barcode.symbology': s!['barcode.symbology'],
      'barcode.showText': !!s!['barcode.showText'],
      'brand.preset': s!['brand.preset'] || 'gofood',
      'brand.name': s!['brand.name'],
      'brand.primaryColor': s!['brand.primaryColor'],
      'brand.tagline': s!['brand.tagline'],
      'brand.logo': s!['brand.logo'] || 'gofood',
      'brand.fontScale': Number(s!['brand.fontScale']) || 1,
      'label.showDietType': s!['label.showDietType'] !== false,
      'label.timeMode': s!['label.timeMode'] || 'ticket',
      'label.ticketDay': s!['label.ticketDay'] || 'tomorrow',
      'label.shelfHoursDefault': Number(s!['label.shelfHoursDefault']) || 42,
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
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <input
            type="password"
            value={tok}
            placeholder="значение GOFOOD_TOKEN из Cloudflare Pages → Settings"
            style={{ maxWidth: 420, flex: 1 }}
            onChange={(e) => {
              setTok(e.target.value);
              setToken(e.target.value);
            }}
          />
          <span
            style={{
              fontWeight: 700,
              whiteSpace: 'nowrap',
              color:
                tokState === 'ok' || tokState === 'notneeded'
                  ? '#1a8a3a'
                  : tokState === 'bad'
                  ? '#c0392b'
                  : '#8a8a8a',
            }}
          >
            {tokState === 'checking'
              ? 'проверяю…'
              : tokState === 'ok'
              ? '✓ пароль принят'
              : tokState === 'bad'
              ? '✗ неверный пароль'
              : tokState === 'notneeded'
              ? '✓ пароль не требуется'
              : ''}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Сохраняется автоматически в этом браузере, кнопка не нужна. <b>Без верного пароля
          импорт и правка блюд (в т.ч. состав) не сохраняются</b> — сервер отвечает 401.
        </p>
        <div className={'banner ' + (agent?.online ? 'ok' : 'err')} style={{ marginTop: 12 }}>
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
          Размер по умолчанию. На экране печати кухня выбирает «80 × 50 мм» или «100 × 70 мм»
          (запоминается в браузере). Макет альбомный: 80 × 50 — компактный «Макет 1»,
          100 × 70 — прежний классический макет.
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
        <h2>Оформление этикетки</h2>
        <label className="fld">Бренд</label>
        <select
          value={s['brand.preset'] || 'gofood'}
          onChange={(e) => {
            const p = e.target.value;
            const PRE: any = {
              gofood: { name: 'gofood', logo: 'gofood', tagline: 'Больше энергии — больше возможностей', color: '#F2661F' },
              greencity: { name: 'GreenCity', logo: 'greencity', tagline: 'Вкусно и полезно', color: '#8CC63F' },
            };
            if (PRE[p]) {
              setS({
                ...s,
                'brand.preset': p,
                'brand.name': PRE[p].name,
                'brand.logo': PRE[p].logo,
                'brand.tagline': PRE[p].tagline,
                'brand.primaryColor': PRE[p].color,
              });
            } else {
              set('brand.preset', p);
            }
          }}
          style={{ maxWidth: 360 }}
        >
          <option value="gofood">gofood — «Больше энергии — больше возможностей», оранжевый</option>
          <option value="greencity">GreenCity — «Вкусно и полезно», зелёный</option>
          <option value="custom">Свой (поля ниже)</option>
        </select>
        <p className="muted" style={{ fontSize: 12 }}>
          Пресет задаёт логотип, слоган и цвет (поля ниже обновятся). <b>Нажмите «Сохранить настройки»</b>,
          затем откройте «Печать» и обновите страницу (Ctrl+F5).
        </p>
        <div
          className="row"
          style={{
            gap: 10,
            alignItems: 'center',
            padding: '8px 10px',
            border: '1px solid var(--line)',
            borderRadius: 10,
            marginTop: 6,
          }}
        >
          <img
            src={`/logo-${s['brand.logo'] || 'gofood'}.png`}
            alt="logo"
            style={{ height: 34 }}
            onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')}
          />
          <span style={{ fontWeight: 700 }}>{s['brand.tagline']}</span>
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: s['brand.primaryColor'],
              display: 'inline-block',
            }}
          />
          <span className="mono muted" style={{ fontSize: 12 }}>{s['brand.primaryColor']}</span>
        </div>
        <div className="split2" style={{ marginTop: 8, opacity: (s['brand.preset'] || 'gofood') === 'custom' ? 1 : 0.5 }}>
          <div>
            <label className="fld">Название (custom)</label>
            <input value={s['brand.name']} onChange={(e) => set('brand.name', e.target.value)} />
            <label className="fld">Цвет (custom)</label>
            <input type="text" value={s['brand.primaryColor']} onChange={(e) => set('brand.primaryColor', e.target.value)} />
            <label className="fld">Логотип-файл (custom)</label>
            <select value={s['brand.logo'] || 'gofood'} onChange={(e) => set('brand.logo', e.target.value)}>
              <option value="gofood">logo-gofood.png</option>
              <option value="greencity">logo-greencity.png</option>
            </select>
          </div>
          <div>
            <label className="fld">Слоган (custom)</label>
            <input value={s['brand.tagline']} onChange={(e) => set('brand.tagline', e.target.value)} />
            <label className="fld">Масштаб шрифта</label>
            <input type="number" step="0.05" value={s['brand.fontScale']} onChange={(e) => set('brand.fontScale', e.target.value)} />
          </div>
        </div>
        <label className="row" style={{ gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={s['label.showDietType'] !== false}
            onChange={(e) => set('label.showDietType', e.target.checked)}
          />
          В блоке «Категория» показывать «Классическое питание» / «Правильное питание»
        </label>

        <label className="fld">Условия хранения (температурная строка)</label>
        <textarea value={s['storage.text']} onChange={(e) => set('storage.text', e.target.value)} />
        <p className="muted" style={{ fontSize: 12 }}>
          Строку «Срок хранения …» добавлять не нужно — она подставляется автоматически
          (42 часа, а для Десертов и Напитков 72).
        </p>
      </div>

      {/* --- Дата/время --- */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Дата/время на этикетке</h2>

        <label className="fld">Как считать дату и время</label>
        <select value={s['label.timeMode'] || 'ticket'} onChange={(e) => set('label.timeMode', e.target.value)}>
          <option value="ticket">По категории (как в iiko-ценнике): дата по варианту ниже, время из таблицы</option>
          <option value="formula">Расчёт из контрольных примеров (старый режим)</option>
        </select>

        {(s['label.timeMode'] || 'ticket') === 'ticket' && (
          <>
            <label className="fld">Вариант этикетки по дате изготовления</label>
            <select
              value={s['label.ticketDay'] || 'tomorrow'}
              onChange={(e) => set('label.ticketDay', e.target.value)}
              style={{ maxWidth: 420 }}
            >
              <option value="today">Сегодняшний день — дата = текущий день</option>
              <option value="tomorrow">Завтрашний день — дата = текущий день + 1</option>
            </select>
            <p className="muted" style={{ fontSize: 12 }}>
              Два iiko-шаблона ценника. Меняется <b>только дата изготовления</b>; вес, время
              изготовления и срок хранения по категориям в обоих вариантах одинаковы.
            </p>
          </>
        )}

        <div className="row wrap" style={{ marginTop: 8 }}>
          <div>
            <label className="fld">Срок хранения по умолчанию, ч</label>
            <input
              type="number"
              min={1}
              value={s['label.shelfHoursDefault'] ?? 42}
              onChange={(e) => set('label.shelfHoursDefault', e.target.value)}
              style={{ width: 110 }}
            />
          </div>
        </div>
        {(s['label.timeMode'] || 'ticket') === 'ticket' ? (
          <div className="banner" style={{ marginTop: 10 }}>
            Таблица «категория → вес / время изготовления»: Горячее из говядины 340 г / 00:05 ·
            из индейки 360 г / 00:10 · из курицы 340 г / 00:25 · из рыбы 320 г / 00:15 ·
            Десерты 170 г / 00:45 (72 ч) · Завтраки 150 г / 01:00 · Напитки 500 мл / 01:10 (72 ч) ·
            Перекусы 140 г / 01:15 · Салаты 160 г / 02:05 · Супы 400 г / 00:40.
            Категории вне таблицы — время не печатается, срок хранения по умолчанию.
          </div>
        ) : (
        <div className="banner warn" style={{ marginTop: 10 }}>
          Правило <b>времени</b> из 6 контрольных примеров ТЗ однозначно не выводится — оно не
          придумано. Точные значения даёт таблица ниже; для прочих моментов время помечается
          приблизительным. Правило <b>даты</b> (смена в 09:00) работает всегда.
        </div>
        )}
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
