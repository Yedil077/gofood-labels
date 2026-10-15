/**
 * Профили печати: размер этикетки на сайте + как её печатать на Epson CW-C4030.
 *
 * Список хранится в настройках (`print.profiles`) и редактируется администратором —
 * новый формат добавляется без изменения кода Print Agent. Макет этикетки выбирается по
 * размеру автоматически (квадрат → круглая, ≥95×65 → классическая, иначе «Макет 1»).
 *
 * Поля профиля:
 *   id            — ключ (хранится в заданиях и истории; прежние '80x50' и т.д. не меняются)
 *   code          — системное имя (LABEL_80x50, ROUND_50…)
 *   title         — название на кнопке
 *   shape         — 'rect' | 'round'
 *   widthMm/heightMm — размер страницы PDF (как рисуется этикетка)
 *   media         — параметры носителя В ДРАЙВЕРЕ (справочно, сайт их не применяет):
 *                   { widthMm, lengthMm, gapMm, form, cut, orientation }
 *   windowsPrinter — очередь Windows, через которую печатать ('' — основной принтер агента)
 *   paperName     — имя размера бумаги в драйвере для этого задания ('' — не менять)
 *   orientation   — 'auto' | 'portrait' | 'landscape' (передаётся SumatraPDF)
 *   ready         — профиль проверен на реальном рулоне: агенту можно печатать автоматически
 *   enabled       — показывать на экране печати
 */
export const DEFAULT_PROFILE_ID = '80x50';

export const DEFAULT_PROFILES = [
  {
    id: '80x50',
    code: 'LABEL_80x50',
    title: '80 × 50 мм',
    shape: 'rect',
    widthMm: 80,
    heightMm: 50,
    // рабочая конфигурация драйвера: носитель 50 × 80 (книжная), PDF 80 × 50 SumatraPDF
    // поворачивает сам (orientation 'auto') — так и печатается сейчас, не меняем
    media: { widthMm: 50, lengthMm: 80, gapMm: 3, form: 'Die-cut label (gap detection)', cut: 'After printing last label', orientation: 'Portrait' },
    windowsPrinter: '',
    paperName: '',
    orientation: 'auto',
    ready: true,
    enabled: true,
  },
  {
    id: '100x70',
    code: 'LABEL_100x70',
    title: '100 × 70 мм',
    shape: 'rect',
    widthMm: 100,
    heightMm: 70,
    media: { widthMm: 70, lengthMm: 100, gapMm: null, form: '', cut: 'After printing last label', orientation: 'Portrait' },
    windowsPrinter: '',
    paperName: '',
    orientation: 'auto',
    ready: false,
    enabled: true,
  },
  {
    id: 'r50',
    code: 'ROUND_50',
    title: '⭘ Круг 5 см',
    shape: 'round',
    widthMm: 50,
    heightMm: 50,
    media: { widthMm: null, lengthMm: null, gapMm: null, form: '', cut: '', orientation: '' },
    windowsPrinter: '',
    paperName: '',
    orientation: 'auto',
    ready: false,
    enabled: true,
  },
  {
    id: 'r60',
    code: 'ROUND_60',
    title: '⭘ Круг 6 см',
    shape: 'round',
    widthMm: 60,
    heightMm: 60,
    media: { widthMm: null, lengthMm: null, gapMm: null, form: '', cut: '', orientation: '' },
    windowsPrinter: '',
    paperName: '',
    orientation: 'auto',
    ready: false,
    enabled: true,
  },
];

/** Совместимость: прежний список размеров. */
export const LABEL_SIZES = DEFAULT_PROFILES;

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

/** Привести профиль к полному виду (данные из настроек могут быть неполными). */
export function normalizeProfile(p) {
  const id = String(p?.id || '').trim();
  const w = num(p?.widthMm, 80);
  const h = num(p?.heightMm, 50);
  return {
    id,
    code: String(p?.code || '').trim() || id.toUpperCase(),
    title: String(p?.title || '').trim() || `${w} × ${h} мм`,
    shape: p?.shape === 'round' || w === h ? 'round' : 'rect',
    widthMm: w,
    heightMm: h,
    media: { widthMm: null, lengthMm: null, gapMm: null, form: '', cut: '', orientation: '', ...(p?.media || {}) },
    windowsPrinter: String(p?.windowsPrinter || '').trim(),
    paperName: String(p?.paperName || '').trim(),
    orientation: ['portrait', 'landscape'].includes(p?.orientation) ? p.orientation : 'auto',
    ready: p?.ready === true,
    enabled: p?.enabled !== false,
  };
}

/** Профили из настроек (или по умолчанию). Порядок — как задан администратором. */
export function getProfiles(settings) {
  const list = settings && Array.isArray(settings['print.profiles']) ? settings['print.profiles'] : DEFAULT_PROFILES;
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const n = normalizeProfile(p);
    if (!n.id || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out.length ? out : DEFAULT_PROFILES.map(normalizeProfile);
}

export function profileById(settings, id) {
  return getProfiles(settings).find((p) => p.id === id) || null;
}

/** Совместимость со старым API (без настроек — профили по умолчанию). */
export function labelSizeById(id, settings) {
  return profileById(settings, id);
}

/** Профиль по размеру страницы (или первый). */
export function labelSizeFor(widthMm, heightMm, settings) {
  const list = getProfiles(settings);
  return list.find((s) => s.widthMm === Number(widthMm) && s.heightMm === Number(heightMm)) || list[0];
}

/** Подпись размера для экранов (по профилю, иначе как есть). */
export function profileTitle(settings, id) {
  return profileById(settings, id)?.title || id || '—';
}
