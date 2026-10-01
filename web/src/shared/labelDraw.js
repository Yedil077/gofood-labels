/**
 * Отрисовка этикетки на 2D-контексте канваса (browser + Node одинаково).
 *
 * Основной режим — минималистичный векторный макет: слева логотип (картинка `logoImage`)
 * и блок «Состав», справа Название / Категория / КБЖУ / Штрихкод / Дата-время, снизу
 * блок «Хранить в холодильнике».
 *
 * `templateImage` + `useTemplate:true` — альтернативный режим: фон = готовая картинка-макет.
 * `barcode` — уже готовое изображение штрихкода.
 */

const fmtNum = (v) => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

/* Зоны значений для режима картинки-макета (доли от 1556×1011). */
const ZT = {
  composition: { x: 0.032, y: 0.602, w: 0.26, h: 0.33, size: 0.0225, min: 0.017, lines: 13, lh: 1.26 },
  name: { x: 0.334, y: 0.246, w: 0.628, h: 0.15, size: 0.04, min: 0.026, lines: 3, lh: 1.06, bold: true },
  category: { x: 0.334, y: 0.492, w: 0.298, h: 0.055, size: 0.03, min: 0.02, lines: 2, lh: 1.1 },
  kbju: { x: 0.676, y: 0.478, w: 0.3, h: 0.095, size: 0.026, min: 0.019, lh: 1.3 },
  barcode: { x: 0.333, y: 0.665, w: 0.3, h: 0.076 },
  barcodeText: { x: 0.333, y: 0.752, w: 0.3, size: 0.024 },
  date: { x: 0.677, y: 0.676, size: 0.043, bold: true },
  time: { x: 0.677, y: 0.723, size: 0.052, bold: true },
};

/**
 * Какой векторный макет рисовать.
 *  0 — классический макет под старый носитель 100×70 (включается только на носителе ≥ 95×65 мм);
 *  1 — «Макет 1»: компактная копия классического под 80×50;
 *  2 — «Макет 2»: компоновка, оптимизированная под 80×50.
 * Номер макета приходит в `data.layout` (выбор на экране печати).
 */
export function pickLayout(opts) {
  if (opts.widthMm >= 95 && opts.heightMm >= 65) return 0;
  return Number(opts.data?.layout) === 2 ? 2 : 1;
}

export function drawLabel(ctx, opts) {
  const { widthMm, heightMm, pxPerMm } = opts;
  const useTemplate = opts.useTemplate !== false && opts.templateImage;
  const W = widthMm * pxPerMm;
  const H = heightMm * pxPerMm;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (useTemplate) drawWithTemplate(ctx, opts, W, H);
  else {
    const layout = pickLayout(opts);
    if (layout === 2) drawCompact2(ctx, opts);
    else if (layout === 1) drawCompact1(ctx, opts);
    else drawVector(ctx, opts);
  }
  ctx.restore();
}

/* ===================== общие хелперы векторных макетов ===================== */

/** Набор примитивов в миллиметрах (все макеты рисуют в мм, а не в пикселях). */
function makeKit(ctx, opts) {
  const { pxPerMm, data } = opts;
  const FF = opts.fontFamily || 'Arial, "Segoe UI", sans-serif';
  const K = data.fontScale || 1;
  const mm = (v) => v * pxPerMm;
  const brand = data.brand?.color || '#F2661F';
  const GREY = '#8a8a8a';
  const LINE = '#dcdcdc';
  const INK = '#111111';

  ctx.textBaseline = 'top';
  const font = (s, b) => `${b ? 'bold ' : ''}${Math.max(6, mm(s * K))}px ${FF}`;
  const text = (s, x, y, sz, o = {}) => {
    ctx.fillStyle = o.color || INK;
    ctx.font = font(sz, o.bold);
    ctx.fillText(s, mm(x), mm(y));
  };
  const cap = (s, x, y, sz = 1.9) => {
    ctx.fillStyle = GREY;
    ctx.font = font(sz, true);
    ctx.fillText(String(s).toUpperCase(), mm(x), mm(y));
  };
  const dotted = (x1, y1, x2, y2, c = LINE) => {
    ctx.save();
    ctx.strokeStyle = c;
    ctx.lineWidth = Math.max(1, mm(0.22));
    ctx.setLineDash([mm(0.7), mm(0.8)]);
    ctx.beginPath();
    ctx.moveTo(mm(x1), mm(y1));
    ctx.lineTo(mm(x2), mm(y2));
    ctx.stroke();
    ctx.restore();
  };
  const wrap = (s, mw, f) => {
    ctx.font = f;
    const w = String(s).split(/\s+/).filter(Boolean);
    const L = [];
    let c = '';
    for (const x of w) {
      const t = c ? c + ' ' + x : x;
      if (!c || ctx.measureText(t).width <= mm(mw)) c = t;
      else {
        L.push(c);
        c = x;
      }
    }
    if (c) L.push(c);
    return L;
  };
  const fit = (s, mw, ml, st, mn, b) => {
    let sz = st;
    let L = wrap(s, mw, font(sz, b));
    let g = 0;
    while (g++ < 120 && sz > mn && (L.length > ml || L.some((l) => ctx.measureText(l).width > mm(mw)))) {
      sz = Math.max(mn, Math.round((sz - 0.15) * 100) / 100);
      L = wrap(s, mw, font(sz, b));
    }
    if (L.length > ml) {
      L = L.slice(0, ml);
      ctx.font = font(sz, b);
      let last = L[ml - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > mm(mw)) last = last.slice(0, -1);
      L[ml - 1] = last + '…';
    }
    return { lines: L, size: sz };
  };
  const lines = (L, x, y, sz, o = {}) => {
    ctx.fillStyle = o.color || INK;
    ctx.font = font(sz, o.bold);
    const st = sz * K * (o.lh || 1.16);
    let yy = y;
    for (const l of L) {
      ctx.fillText(l, mm(x), mm(yy));
      yy += st;
    }
    return yy;
  };
  /** Ширина строки в мм. */
  const width = (s, sz, b) => {
    ctx.font = font(sz, b);
    return ctx.measureText(String(s)).width / pxPerMm;
  };
  /** Подпись-капс, ужимается под ширину. */
  const capFit = (s, x, y, sz, maxW) => {
    const t = String(s).toUpperCase();
    let z = sz;
    while (z > 1.05 && width(t, z, true) > maxW) z = Math.round((z - 0.05) * 100) / 100;
    cap(t, x, y, z);
  };
  /**
   * Абзац в жёсткой рамке [top..bottom] × w: шрифт ужимается от `start` до `min`,
   * если всё равно не влезает — последняя видимая строка обрывается «…».
   * Ничего не рисует ниже `bottom`. Возвращает y после последней строки.
   */
  const paragraph = (s, x, top, w, bottom, start, min, lh, o = {}) => {
    const avail = bottom - top;
    let size = start;
    let f = fit(s, w, 60, size, min, !!o.bold);
    while (size > min && f.lines.length * f.size * K * lh > avail) {
      size = Math.round((size - 0.05) * 100) / 100;
      f = fit(s, w, 60, size, min, !!o.bold);
    }
    const maxLines = Math.max(1, Math.floor((avail + 1e-6) / (f.size * K * lh)));
    let out = f.lines.slice(0, maxLines);
    if (f.lines.length > maxLines && out.length) {
      ctx.font = font(f.size, !!o.bold);
      let last = out[out.length - 1].replace(/[,;\s]+$/, '');
      while (last.length > 1 && ctx.measureText(last + '…').width > mm(w)) last = last.slice(0, -1).replace(/[,;\s]+$/, '');
      out[out.length - 1] = last + '…';
    }
    return lines(out, x, top, f.size, { lh, bold: o.bold, color: o.color });
  };
  /** Логотип без искажения пропорций, по центру бокса по горизонтали, прижат к верху. */
  const logoBox = (img, x, y, w, h) => {
    if (img && img.width) {
      const r = Math.min(mm(w) / img.width, mm(h) / img.height);
      const dw = img.width * r;
      const dh = img.height * r;
      ctx.drawImage(img, mm(x) + (mm(w) - dw) / 2, mm(y), dw, dh);
      return dh / pxPerMm;
    }
    ctx.fillStyle = INK;
    ctx.font = `bold ${mm(Math.min(6, h * 0.6))}px ${FF}`;
    ctx.fillText(data.brand?.name || 'gofood', mm(x), mm(y + 1));
    return h;
  };
  /**
   * Штрихкод. Ширина — как на прежней этикетке 100×70 (тот же модуль ≈0.27 мм для EAN-13,
   * чтобы не ухудшить сканирование); уменьшается только высота штрихов.
   * Сглаживание выключено — края штрихов остаются чёткими. Возвращает {w,h} в мм.
   */
  const barcodeWidth = (bc) => (bc && bc.image ? Math.min(32, (9.5 * bc.width) / bc.height) : 0);
  const drawBarcode = (bc, value, x, y, barH, digitsSz) => {
    const bw = barcodeWidth(bc);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bc.image, mm(x), mm(y), mm(bw), mm(barH));
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.font = font(digitsSz, false);
    const tw = ctx.measureText(value).width;
    ctx.fillText(value, mm(x) + Math.max(0, (mm(bw) - tw) / 2), mm(y + barH + 0.4));
    return { w: bw, h: barH + 0.4 + digitsSz * K };
  };
  const ctxFont = (f) => {
    ctx.font = f;
  };
  const widthPx = (s) => ctx.measureText(s).width;
  return { mm, K, brand, GREY, LINE, INK, font, text, cap, capFit, dotted, wrap, fit, lines, width, paragraph, logoBox, barcodeWidth, drawBarcode, ctxFont, widthPx };
}

/* ============== классический макет 100×70 (старый носитель) ============== */

function drawVector(ctx, opts) {
  const { widthMm, heightMm, pxPerMm, data } = opts;
  const safeMm = opts.safeMm || 3;
  const barcode = opts.barcode || null;
  const logo = opts.logoImage || null;
  const FF = opts.fontFamily || 'Arial, "Segoe UI", sans-serif';
  const { mm, K, brand, GREY, LINE, INK, font, text, cap, dotted, wrap, fit, lines } = makeKit(ctx, opts);

  const dividerX = Math.round(widthMm * 0.31);
  const xL0 = safeMm;
  const xLw = dividerX - safeMm - 2;
  const xR0 = dividerX + 3;
  const xR1 = widthMm - safeMm;
  const rW = xR1 - xR0;
  const stripH = 9;
  const botSafe = 2; // нижний край: принтер там не печатает — держим отступ
  const stripY = heightMm - stripH - botSafe;
  // без внешней рамки — печаталась серой чертой по краю; оставлен только
  // вертикальный разделитель колонок (рисуется ниже).

  /* --- логотип: по центру левой колонки --- */
  const logoBoxW = xLw;
  const logoBoxH = 18;
  if (logo && logo.width) {
    const r = Math.min(mm(logoBoxW) / logo.width, mm(logoBoxH) / logo.height);
    const dw = logo.width * r;
    const dh = logo.height * r;
    const lx = mm(xL0) + (mm(xLw) - dw) / 2; // центрируем по горизонтали
    ctx.drawImage(logo, lx, mm(safeMm), dw, dh);
  } else {
    ctx.fillStyle = '#111';
    ctx.font = `bold ${mm(6)}px ${FF}`;
    ctx.fillText('gofood', mm(xL0), mm(safeMm + 8));
  }

  // GreenCity — слоган под логотипом; gofood — по-старому, сверху правой колонки.
  const isGreenCity = (data.brand?.logo || '') === 'greencity';

  /* --- слоган под логотипом (только GreenCity): текст по центру, без листка --- */
  let compTop = safeMm + logoBoxH + 3;
  if (isGreenCity && data.brand?.tagline) {
    const ty = safeMm + logoBoxH + 1.4;
    const t = fit(data.brand.tagline, xLw, 1, 2.7, 1.7, true);
    ctx.font = font(t.size, true);
    const twMm = ctx.measureText(t.lines[0]).width / pxPerMm;
    const sx = xL0 + Math.max(0, (xLw - twMm) / 2);
    text(t.lines[0], sx, ty, t.size, { bold: true }); // чёрный, как надпись на логотипе
    compTop = ty + Math.max(3.6, t.size * K + 1.4) + 1.6;
  }

  /* --- состав (жёстко в границах, не заезжает на нижнюю плашку) --- */
  const compTextTop = compTop + 6.2;
  const compBottom = stripY - 2; // не ниже нижней плашки
  text('Состав', xL0, compTop, 3.2, { bold: true });
  dotted(xL0, compTop + 4.6, xL0 + xLw, compTop + 4.6, brand);
  if (data.composition && data.composition.trim()) {
    const avail = compBottom - compTextTop;
    let size = 2.5;
    let f = fit(data.composition, xLw, 40, size, 1.6, false);
    // подбираем размер, чтобы все строки влезли по высоте
    while (size > 1.6 && f.lines.length * f.size * 1.24 > avail) {
      size = Math.round((size - 0.1) * 10) / 10;
      f = fit(data.composition, xLw, 40, size, 1.6, false);
    }
    const maxLines = Math.max(1, Math.floor(avail / (f.size * 1.24)));
    let out = f.lines.slice(0, maxLines);
    if (f.lines.length > maxLines && out.length) {
      let last = out[out.length - 1].replace(/[,\s]+$/, '');
      out[out.length - 1] = last + '…';
    }
    lines(out, xL0, compTextTop, f.size, { lh: 1.24 });
  } else {
    text('—', xL0, compTextTop, 2.4, { color: GREY });
  }

  /* --- правая колонка --- */
  let y = safeMm + 1.5;
  // gofood — слоган сверху правой колонки, над «Название блюда» (как раньше)
  if (!isGreenCity && data.brand?.tagline) {
    const t = fit(data.brand.tagline, rW - 6, 1, 2.7, 1.9, true);
    ctx.font = font(t.size, true);
    const twMm = ctx.measureText(t.lines[0]).width / pxPerMm;
    const groupW = twMm + 4; // листок + отступ
    const startX = xR0 + Math.max(0, (rW - groupW) / 2); // по центру колонки
    ctx.save();
    ctx.fillStyle = brand;
    ctx.beginPath();
    ctx.ellipse(mm(startX + 1), mm(y + 1.3), mm(1.3), mm(0.7), -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    text(t.lines[0], startX + 3.4, y, t.size, { bold: true });
    y += Math.max(3.2, t.size * K + 1.2);
  }
  dotted(xR0, y, xR1, y, brand);
  // вертикальный разделитель колонок — от этой линии до нижней плашки
  ctx.save();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = Math.max(1, mm(0.3));
  ctx.beginPath();
  ctx.moveTo(mm(dividerX), mm(y));
  ctx.lineTo(mm(dividerX), mm(stripY));
  ctx.stroke();
  ctx.restore();
  y += 1.6;

  const cW = (rW - 3) / 2;
  const bx = xR0 + cW + 3;

  // Нижние два блока — ближе к верху (пользователь просил приподнять
  // название / категорию / КБЖУ / штрихкод). Между ними и названием — гибкий зазор.
  const bottomOfContent = stripY - 4.5;
  const botH = 14; // штрихкод / дата-время
  const midH = 10.5; // категория / КБЖУ
  const botTop = bottomOfContent - botH;
  const midTop = botTop - 1.6 - 1.8 - midH;

  // --- название: по центру полосы между шапкой и mid-блоком.
  // Название печатается ПОЛНОСТЬЮ: до 6 строк, шрифт ужимается до 1.9 мм,
  // «…» практически не появляется. ---
  cap('Название блюда', xR0, y);
  const nameTop = y + 2.6;
  const nameBottom = midTop - 2.4;
  let nf = fit(data.name || '—', rW, 6, 4.4, 1.9, true);
  while (nf.size > 1.9 && nf.lines.length * nf.size * 1.14 > nameBottom - nameTop) {
    nf = fit(data.name || '—', rW, 6, nf.size - 0.15, 1.9, true);
  }
  const blockH = nf.lines.length * nf.size * 1.14;
  const nameY = nameTop + Math.max(0, (nameBottom - nameTop - blockH) / 2);
  lines(nf.lines, xR0, nameY, nf.size, { bold: true, lh: 1.14 });
  dotted(xR0, midTop - 2, xR1, midTop - 2, brand);

  // --- категория (тип питания) / КБЖУ ---
  cap('Категория', xR0, midTop);
  if (data.showDietType) {
    const dl = data.dietTypeLabelFull || (data.dietType === 'pp' ? 'Правильное питание' : 'Классическое питание');
    const df = fit(dl, cW, 2, 3.0, 2.2, true);
    lines(df.lines, xR0, midTop + 2.5, df.size, { bold: true, lh: 1.1 });
  } else if (data.category) {
    const cf = fit(data.category, cW, 3, 2.9, 2.1, false);
    lines(cf.lines, xR0, midTop + 2.5, cf.size, { lh: 1.12 });
  } else {
    text('—', xR0, midTop + 2.8, 2.5, { color: GREY });
  }
  cap('КБЖУ', bx, midTop);
  const k = data.kbju || {};
  const kSize = 2.1;
  const weightTxt = data.weight ? `Вес: ${data.weight}` : '';
  if (k.protein != null || k.fat != null || k.carbs != null || k.kcal != null) {
    // Б/Ж/У/Ккал построчно слева; «Вес» — крупнее и жирнее, сбоку по центру блока
    const firstY = midTop + 2.3;
    const rowH = kSize * K * 1.12;
    const macroLines = [
      `Белки: ${fmtNum(k.protein)} г`,
      `Жиры: ${fmtNum(k.fat)} г`,
      `Углеводы: ${fmtNum(k.carbs)} г`,
    ];
    lines([...macroLines, `Ккал: ${k.kcal == null ? '—' : Math.round(k.kcal)}`], bx, firstY, kSize, { lh: 1.12 });
    if (weightTxt) {
      let wSize = 2.8;
      ctx.font = font(wSize, true);
      let wMm = ctx.measureText(weightTxt).width / pxPerMm;
      // не даём «Весу» наезжать на длинные значения Б/Ж/У (редкий случай трёхзначных чисел)
      ctx.font = font(kSize, false);
      const maxRowMm = Math.max(...macroLines.map((s) => ctx.measureText(s).width / pxPerMm));
      while (wSize > 2.1 && bx + maxRowMm + 1.5 > xR1 - wMm) {
        wSize = Math.round((wSize - 0.1) * 10) / 10;
        ctx.font = font(wSize, true);
        wMm = ctx.measureText(weightTxt).width / pxPerMm;
      }
      const blockCenterY = firstY + (4 * rowH) / 2;
      const wy = blockCenterY - (wSize * K * 1.12) / 2;
      text(weightTxt, xR1 - wMm, wy, wSize, { bold: true });
    }
  } else if (weightTxt) {
    text(weightTxt, bx, midTop + 2.8, 2.5, { bold: true });
  } else {
    text('—', bx, midTop + 2.8, 2.5, { color: GREY });
  }
  dotted(xR0, botTop - 1.6, xR1, botTop - 1.6, brand);
  cap('Штрихкод', xR0, botTop);
  if (data.barcodeValue && barcode && barcode.image) {
    const boxW = mm(cW + 2);
    const boxH = mm(9.5);
    const r = Math.min(boxW / barcode.width, boxH / barcode.height);
    const dw = barcode.width * r;
    const dh = barcode.height * r;
    ctx.drawImage(barcode.image, mm(xR0), mm(botTop + 2), dw, dh);
    ctx.fillStyle = INK;
    ctx.font = font(2.4, false);
    const t = data.barcodeValue;
    const tw = ctx.measureText(t).width;
    ctx.fillText(t, mm(xR0) + Math.max(0, (dw - tw) / 2), mm(botTop + 2) + dh + mm(0.6));
  } else if (data.barcodeValue) {
    text(data.barcodeValue, xR0, botTop + 4, 3, { bold: true });
  } else {
    text('—', xR0, botTop + 5, 2.5, { color: GREY });
  }
  const capX = bx + 1;
  const dx = bx + 3; // значения даты/времени — правее подписи
  cap('Дата / время изготовления', capX, botTop);
  text(data.dateStr || '—', dx, botTop + 3.5, 3.4, { bold: true });
  text(data.timeStr || '', dx, botTop + 8.5, 4.4, { bold: true });

  /* --- нижняя полоса --- */
  dotted(xL0, stripY, xR1, stripY, brand);
  const fridgeCy = stripY + stripH / 2;
  drawFridge(ctx, mm, brand, xL0 + 3, fridgeCy, 2.7);
  {
    const availW = widthMm - (xL0 + 8) - safeMm;
    const parts = String(data.storageText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    let sz = 2.4;
    let els = [];
    for (let g = 0; g < 10; g++) {
      els = [];
      for (const p of parts) for (const w of wrap(p, availW, font(sz, false))) els.push(w);
      if (els.length <= 3 || sz <= 1.8) break;
      sz = Math.round((sz - 0.15) * 100) / 100;
    }
    els = els.slice(0, 3);
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    ctx.font = font(sz, false);
    const lh = mm(sz * K * 1.18);
    const y0 = mm(fridgeCy) - ((els.length - 1) * lh) / 2;
    els.forEach((l, i) => ctx.fillText(l, mm(xL0 + 8), y0 + i * lh));
    ctx.restore();
  }
}

/* ---------- общие куски компактных макетов (80×50) ---------- */

/** Текст блока «Категория»: тип питания или категория iiko. */
function dietText(data) {
  if (data.showDietType) {
    return data.dietTypeLabelFull || (data.dietType === 'pp' ? 'Правильное питание' : 'Классическое питание');
  }
  return data.category || '';
}

/** Строки условий хранения (как в классическом макете): разбиение по \n, затем перенос по ширине. */
function storageLines(kit, storageText, w, start, min, maxLines) {
  const parts = String(storageText || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  // перенос по словам, но «+6 °C.» не разрывается (единица не уходит на новую строку одна)
  const wrapKeep = (p, f) => {
    const toks = [];
    for (const t of p.split(/\s+/).filter(Boolean)) {
      if (/^°/.test(t) && toks.length) toks[toks.length - 1] += ' ' + t;
      else toks.push(t);
    }
    kit.ctxFont(f);
    const out = [];
    let cur = '';
    for (const t of toks) {
      const c = cur ? cur + ' ' + t : t;
      if (!cur || kit.widthPx(c) <= kit.mm(w)) cur = c;
      else {
        out.push(cur);
        cur = t;
      }
    }
    if (cur) out.push(cur);
    return out;
  };
  let sz = start;
  let els = [];
  for (let g = 0; g < 20; g++) {
    els = [];
    for (const p of parts) for (const l of wrapKeep(p, kit.font(sz, false))) els.push(l);
    if (els.length <= maxLines || sz <= min) break;
    sz = Math.round((sz - 0.05) * 100) / 100;
  }
  return { lines: els.slice(0, maxLines), size: sz };
}

/* ======================= Макет 1 — компактная копия ======================= */
/*
 * Та же структура, что у классического: слева логотип (+ слоган GreenCity) и «Состав»,
 * справа «Название блюда», ряд «Категория | КБЖУ+Вес», ряд «Дата/время | Штрихкод»,
 * снизу полоса хранения. Отличие: штрихкод и дата поменялись местами — штрихкод
 * занимает фиксированную ширину (как раньше) и встаёт под КБЖУ, колонки выровнены.
 */
function drawCompact1(ctx, opts) {
  const { widthMm: W, heightMm: H, data } = opts;
  const kit = makeKit(ctx, opts);
  const { mm, K, brand, GREY, LINE, INK, font, text, cap, capFit, dotted, fit, lines, width, paragraph, logoBox } = kit;
  const s = opts.safeMm || 3;
  const barcode = opts.barcode || null;
  const isGC = (data.brand?.logo || '') === 'greencity';

  const dividerX = Math.round(W * 0.31); // 25 мм на 80
  const xL0 = s;
  const xLw = dividerX - s - 1.5;
  const xR0 = dividerX + 3;
  const xR1 = W - s;
  const rW = xR1 - xR0;
  const stripH = 6.5;
  const botSafe = 2; // нижний край: принтер там не печатает
  const stripY = H - stripH - botSafe;

  /* --- левая колонка: логотип, слоган (GreenCity), состав --- */
  const logoH = 10.5;
  logoBox(opts.logoImage, xL0, s, xLw, logoH);
  let compTop = s + logoH + 1.8;
  if (isGC && data.brand?.tagline) {
    const ty = s + logoH + 0.6;
    const t = fit(data.brand.tagline, xLw, 1, 1.75, 1.3, true);
    const tw = width(t.lines[0], t.size, true);
    text(t.lines[0], xL0 + Math.max(0, (xLw - tw) / 2), ty, t.size, { bold: true });
    compTop = ty + t.size * K * 1.15 + 1.3;
  }
  text('Состав', xL0, compTop, 2.1, { bold: true });
  dotted(xL0, compTop + 2.9, xL0 + xLw, compTop + 2.9, brand);
  if (data.composition && data.composition.trim()) {
    paragraph(data.composition, xL0, compTop + 3.6, xLw, stripY - 1.0, 1.85, 1.5, 1.2);
  } else {
    text('—', xL0, compTop + 3.8, 2, { color: GREY });
  }

  /* --- правая колонка --- */
  let y = s + 0.4;
  if (!isGC && data.brand?.tagline) {
    // gofood: слоган с листком над «Название блюда», как в классическом макете
    const t = fit(data.brand.tagline, rW - 4, 1, 1.85, 1.3, true);
    const tw = width(t.lines[0], t.size, true);
    const startX = xR0 + Math.max(0, (rW - tw - 3) / 2);
    ctx.save();
    ctx.fillStyle = brand;
    ctx.beginPath();
    ctx.ellipse(mm(startX + 0.8), mm(y + t.size * 0.5), mm(0.95), mm(0.5), -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    text(t.lines[0], startX + 2.6, y, t.size, { bold: true });
    y += Math.max(2.6, t.size * K + 0.9);
  }
  dotted(xR0, y, xR1, y, brand);
  ctx.save();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = Math.max(1, mm(0.25));
  ctx.beginPath();
  ctx.moveTo(mm(dividerX), mm(y));
  ctx.lineTo(mm(dividerX), mm(stripY));
  ctx.stroke();
  ctx.restore();
  y += 0.9;

  // правая подколонка (КБЖУ / Штрихкод) — ширины штрихкода, левая (Категория / Дата) — остаток
  const bw = kit.barcodeWidth(barcode) || 25.8;
  const rx = xR1 - Math.max(bw, 24);
  const lW = rx - xR0 - 2;

  const botH = 10.8;
  const botTop = stripY - 1.3 - botH;
  const midH = 9.4;
  const midTop = botTop - 1.5 - midH;

  // название — главный элемент: до 4 строк, шрифт 3.4 → 1.9 мм, по центру своей полосы
  cap('Название блюда', xR0, y, 1.4);
  const nameTop = y + 2.0;
  const nameBottom = midTop - 1.7;
  let nf = fit(data.name || '—', rW, 4, 3.4, 1.9, true);
  while (nf.size > 1.9 && nf.lines.length * nf.size * K * 1.12 > nameBottom - nameTop) {
    nf = fit(data.name || '—', rW, 4, nf.size - 0.1, 1.9, true);
  }
  const nameH = nf.lines.length * nf.size * K * 1.12;
  lines(nf.lines, xR0, nameTop + Math.max(0, (nameBottom - nameTop - nameH) / 2), nf.size, { bold: true, lh: 1.12 });
  dotted(xR0, midTop - 1.0, xR1, midTop - 1.0, brand);

  // категория
  cap('Категория', xR0, midTop, 1.4);
  const dl = dietText(data);
  if (dl) {
    const df = fit(dl, lW, data.showDietType ? 2 : 3, 2.1, 1.5, !!data.showDietType);
    lines(df.lines, xR0, midTop + 2.0, df.size, { bold: !!data.showDietType, lh: 1.1 });
  } else {
    text('—', xR0, midTop + 2.1, 2, { color: GREY });
  }

  // КБЖУ + вес (вес справа, по центру блока, крупнее)
  drawKbjuColumn(kit, data, rx, midTop, xR1, 1.4, 1.7);

  // дата / время — меньше, чем раньше (не акцент)
  dotted(xR0, botTop - 0.8, xR1, botTop - 0.8, brand);
  capFit('Дата / время изготовления', xR0, botTop, 1.4, lW);
  text(data.dateStr || '—', xR0, botTop + 2.2, 2.2, { bold: true });
  if (data.timeStr) text(data.timeStr, xR0, botTop + 5.0, 2.7, { bold: true });

  // штрихкод
  cap('Штрихкод', rx, botTop, 1.4);
  if (data.barcodeValue && barcode && barcode.image) {
    kit.drawBarcode(barcode, data.barcodeValue, rx, botTop + 1.9, 6.4, 1.65);
  } else if (data.barcodeValue) {
    text(data.barcodeValue, rx, botTop + 3, 2.4, { bold: true });
  } else {
    text('—', rx, botTop + 2.6, 2, { color: GREY });
  }

  /* --- нижняя полоса: хранение --- */
  dotted(xL0, stripY, xR1, stripY, brand);
  const cy = stripY + stripH / 2;
  drawFridge(ctx, mm, brand, xL0 + 2.0, cy, 1.9);
  const tx = xL0 + 4.8;
  const st = storageLines(kit, data.storageText, xR1 - tx, 1.75, 1.35, 2);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.font = font(st.size, false);
  const lh = mm(st.size * K * 1.16);
  const y0 = mm(cy) - ((st.lines.length - 1) * lh) / 2;
  st.lines.forEach((l, i) => ctx.fillText(l, mm(tx), y0 + i * lh));
  ctx.restore();
}

/**
 * Колонка КБЖУ (Макет 1): Б/Ж/У/Ккал построчно слева, «ВЕС» + значение справа,
 * по вертикальному центру. Если значения очень длинные — вес ужимается, но не наезжает.
 */
function drawKbjuColumn(kit, data, x, top, xRight, capSz, sz) {
  const { K, GREY, text, cap, lines, width } = kit;
  cap('КБЖУ', x, top, capSz);
  const k = data.kbju || {};
  const has = k.protein != null || k.fat != null || k.carbs != null || k.kcal != null;
  const firstY = top + 2.0;
  const rows = [`Белки: ${fmtNum(k.protein)} г`, `Жиры: ${fmtNum(k.fat)} г`, `Углеводы: ${fmtNum(k.carbs)} г`];
  if (has) lines([...rows, `Ккал: ${k.kcal == null ? '—' : Math.round(k.kcal)}`], x, firstY, sz, { lh: 1.12 });
  else text('—', x, firstY + 0.2, 2, { color: GREY });
  if (!data.weight) return;
  const leftEdge = has ? x + Math.max(...rows.map((r) => width(r, sz, false))) + 1.2 : x;
  let wSz = 2.7;
  while (wSz > 1.7 && xRight - width(data.weight, wSz, true) < leftEdge) wSz = Math.round((wSz - 0.05) * 100) / 100;
  const vw = width(data.weight, wSz, true);
  const blockH = has ? 4 * sz * K * 1.12 : 4;
  const cy = firstY + blockH / 2;
  const capH = capSz * K;
  const y0 = cy - (capH + 0.4 + wSz * K) / 2;
  const cw = width('ВЕС', capSz, true);
  cap('Вес', xRight - Math.max(vw, cw) + (Math.max(vw, cw) - cw), y0, capSz);
  text(data.weight, xRight - vw, y0 + capH + 0.4, wSz, { bold: true });
}

/* =================== Макет 2 — оптимизирован под 80×50 =================== */
/*
 * Шапка: логотип (+ слоган) слева, крупное название справа, под ним — категория.
 * Середина: «Состав» слева, панель КБЖУ + Вес справа (таблица «подпись — значение»).
 * Низ: штрихкод слева; справа — дата/время одной строкой и условия хранения.
 */
function drawCompact2(ctx, opts) {
  const { widthMm: W, heightMm: H, data } = opts;
  const kit = makeKit(ctx, opts);
  const { mm, K, brand, GREY, INK, font, text, cap, dotted, fit, lines, width, paragraph, logoBox } = kit;
  const s = opts.safeMm || 3;
  const barcode = opts.barcode || null;
  const x0 = s;
  const x1 = W - s;
  const yMax = H - 2; // нижний край: принтер там не печатает

  /* --- шапка --- */
  const logoW = 14;
  const logoH = 9.4;
  const lh = logoBox(opts.logoImage, x0, s, logoW, logoH);
  let hdrB = s + 13.2;
  if (data.brand?.tagline) {
    const t = fit(data.brand.tagline, logoW + 1, 2, 1.35, 1.0, true);
    let ty = s + Math.min(lh, logoH) + 0.5;
    for (const l of t.lines) {
      const tw = width(l, t.size, true);
      text(l, x0 + (logoW - tw) / 2, ty, t.size, { bold: true });
      ty += t.size * K * 1.12;
    }
    hdrB = Math.max(hdrB, ty + 0.2);
  }
  const nx = x0 + logoW + 2.2;
  const nW = x1 - nx;
  const cat = dietText(data);
  const catSz = 1.65;
  const catH = cat ? catSz * K + 0.9 : 0;
  const nameAvail = hdrB - s - catH;
  let nf = fit(data.name || '—', nW, 3, 3.8, 2.1, true);
  while (nf.size > 2.1 && nf.lines.length * nf.size * K * 1.1 > nameAvail) {
    nf = fit(data.name || '—', nW, 3, nf.size - 0.1, 2.1, true);
  }
  const nameH = nf.lines.length * nf.size * K * 1.1;
  const blockTop = s + Math.max(0, (hdrB - s - nameH - catH) / 2);
  const afterName = lines(nf.lines, nx, blockTop, nf.size, { bold: true, lh: 1.1 });
  if (cat) {
    const cf = fit(cat, nW - 2.2, 1, catSz, 1.25, false);
    const cy = afterName + 0.6;
    ctx.save();
    ctx.fillStyle = brand;
    ctx.beginPath();
    ctx.arc(mm(nx + 0.7), mm(cy + cf.size * K * 0.55), mm(0.65), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    text(cf.lines[0], nx + 2.0, cy, cf.size, { color: '#444444', bold: !!data.showDietType });
  }
  const div1 = hdrB + 0.6;
  dotted(x0, div1, x1, div1, brand);

  /* --- середина: состав | КБЖУ --- */
  const mT = div1 + 0.8;
  const mB = 33.6 - (50 - H); // на 80×50 — 33.6 мм
  const pw = 24.5;
  const px = x1 - pw;

  cap('Состав', x0, mT, 1.35);
  if (data.composition && data.composition.trim()) {
    paragraph(data.composition, x0, mT + 2.1, px - x0 - 2.2, mB, 1.8, 1.4, 1.18);
  } else {
    text('—', x0, mT + 2.2, 2, { color: GREY });
  }

  // панель КБЖУ: лёгкая подложка фирменного цвета
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = brand;
  roundRect(ctx, mm(px), mm(mT - 0.3), mm(pw), mm(mB - mT + 0.3), mm(1.2));
  ctx.fill();
  ctx.restore();
  const ix0 = px + 1.3;
  const ix1 = x1 - 1.3;
  cap('КБЖУ', ix0, mT + 0.7, 1.35);
  const k = data.kbju || {};
  const g = (v) => (v == null || v === '' ? '—' : `${fmtNum(v)} г`);
  const rows = [
    ['Белки', g(k.protein)],
    ['Жиры', g(k.fat)],
    ['Углеводы', g(k.carbs)],
    ['Ккал', k.kcal == null ? '—' : String(Math.round(k.kcal))],
  ];
  const rSz = 1.65;
  const rStep = 2.1;
  let ry = mT + 2.9;
  for (const [lbl, val] of rows) {
    let vs = rSz;
    while (vs > 1.2 && width(lbl, rSz, false) + 1 + width(val, vs, true) > ix1 - ix0) vs -= 0.05;
    text(lbl, ix0, ry, rSz, {});
    text(val, ix1 - width(val, vs, true), ry, vs, { bold: true });
    ry += rStep;
  }
  // вес — отдельной строкой, крупнее
  const wy = ry + 0.35;
  dotted(ix0, wy, ix1, wy, brand);
  const wVal = data.weight || '—';
  let wSz = 2.6;
  while (wSz > 1.5 && width('Вес', 1.75, false) + 1 + width(wVal, wSz, true) > ix1 - ix0) wSz -= 0.05;
  const wRowY = wy + 0.6;
  const wRowH = Math.max(1.75, wSz) * K;
  text('Вес', ix0, wRowY + (wRowH - 1.75 * K) / 2 + 0.15, 1.75, {});
  text(wVal, ix1 - width(wVal, wSz, true), wRowY + (wRowH - wSz * K) / 2, wSz, { bold: true, color: data.weight ? INK : GREY });

  const div2 = mB + 0.7;
  dotted(x0, div2, x1, div2, brand);

  /* --- низ: штрихкод | дата + хранение --- */
  const bT = div2 + 0.8;
  const bx = x0 + 0.6; // поле этикетки слева — «тихая зона» штрихкода
  let rightX = bx + 28.4;
  if (data.barcodeValue && barcode && barcode.image) {
    const bh = Math.max(5, Math.min(8.2, yMax - bT - 0.4 - 1.6 * K - 0.2));
    const r = kit.drawBarcode(barcode, data.barcodeValue, bx, bT + 0.2, bh, 1.6);
    rightX = bx + r.w + 2.6;
  } else if (data.barcodeValue) {
    text(data.barcodeValue, bx, bT + 1, 2.2, { bold: true });
  } else {
    rightX = x0;
  }
  cap('Изготовлено', rightX, bT, 1.3);
  const dStr = data.dateStr || '—';
  text(dStr, rightX, bT + 1.85, 2.1, { bold: true });
  if (data.timeStr) {
    text(data.timeStr, rightX + width(dStr, 2.1, true) + 1.6, bT + 1.85, 2.1, { bold: true });
  }
  const sTop = bT + 4.9;
  const fr = 1.45;
  drawFridge(ctx, mm, brand, rightX + fr, sTop + fr + 0.1, fr);
  const stx = rightX + 2 * fr + 1.0;
  const maxL = Math.max(1, Math.floor((yMax - sTop) / (1.3 * K * 1.15)));
  const st = storageLines(kit, data.storageText, x1 - stx, 1.6, 1.3, Math.min(3, maxL));
  lines(st.lines, stx, sTop, st.size, { lh: 1.15 });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawFridge(ctx, mm, color, cxMm, cyMm, rMm) {
  const cx = mm(cxMm);
  const cy = mm(cyMm);
  const r = mm(rMm);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = mm(0.45);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * Math.PI) / 3);
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, 0);
    ctx.lineTo(r * 0.6, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/* ========================= режим картинки-макета ========================= */

function drawWithTemplate(ctx, opts, W, H) {
  const { data, barcode = null } = opts;
  const fontFamily = opts.fontFamily || 'Arial, "Segoe UI", sans-serif';
  ctx.drawImage(opts.templateImage, 0, 0, W, H);
  ctx.textBaseline = 'top';
  const INK = '#141210';
  const font = (frac, bold) => `${bold ? 'bold ' : ''}${Math.max(6, frac * H)}px ${fontFamily}`;
  const wrap = (str, maxW, f) => {
    ctx.font = f;
    const words = String(str).split(/\s+/).filter(Boolean);
    const L = [];
    let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (!cur || ctx.measureText(t).width <= maxW) cur = t;
      else {
        L.push(cur);
        cur = wd;
      }
    }
    if (cur) L.push(cur);
    return L;
  };
  const fitLines = (str, maxW, maxLines, sf, mf, bold) => {
    let s = sf;
    let L = wrap(str, maxW, font(s, bold));
    let g = 0;
    while (g++ < 120 && s > mf && (L.length > maxLines || L.some((l) => ctx.measureText(l).width > maxW))) {
      s = Math.max(mf, s - 0.0015);
      L = wrap(str, maxW, font(s, bold));
    }
    if (L.length > maxLines) {
      L = L.slice(0, maxLines);
      ctx.font = font(s, bold);
      let last = L[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      L[maxLines - 1] = last + '…';
    }
    return { lines: L, size: s };
  };
  const block = (str, z) => {
    if (!str) return;
    const maxW = z.w * W;
    const { lines, size } = fitLines(str, maxW, z.lines || 1, z.size, z.min || z.size, z.bold);
    ctx.fillStyle = INK;
    ctx.font = font(size, z.bold);
    const step = size * H * (z.lh || 1.15);
    let y = z.y * H;
    for (const l of lines) {
      ctx.fillText(l, z.x * W, y);
      y += step;
    }
  };

  block(data.name || '', ZT.name);
  block(data.category || '', ZT.category);

  const k = data.kbju || {};
  if (k.protein != null || k.fat != null || k.carbs != null || k.kcal != null) {
    ctx.fillStyle = INK;
    ctx.font = font(ZT.kbju.size, false);
    const step = ZT.kbju.size * H * ZT.kbju.lh;
    const x = ZT.kbju.x * W;
    const y = ZT.kbju.y * H;
    ctx.fillText(`Б: ${fmtNum(k.protein)} г    Ж: ${fmtNum(k.fat)} г`, x, y);
    ctx.fillText(`У: ${fmtNum(k.carbs)} г    Ккал: ${k.kcal == null ? '—' : Math.round(k.kcal)}`, x, y + step);
  }

  if (data.barcodeValue && barcode && barcode.image) {
    const bx = ZT.barcode.x * W;
    const by = ZT.barcode.y * H;
    const bw = ZT.barcode.w * W;
    const bh = ZT.barcode.h * H;
    const r = Math.min(bw / barcode.width, bh / barcode.height);
    const dw = barcode.width * r;
    const dh = barcode.height * r;
    ctx.drawImage(barcode.image, bx + (bw - dw) / 2, by, dw, dh);
    ctx.fillStyle = INK;
    ctx.font = font(ZT.barcodeText.size, false);
    const t = data.barcodeValue;
    const tw = ctx.measureText(t).width;
    ctx.fillText(t, ZT.barcodeText.x * W + (ZT.barcodeText.w * W - tw) / 2, ZT.barcodeText.y * H);
  }

  ctx.fillStyle = INK;
  ctx.font = font(ZT.date.size, true);
  ctx.fillText(data.dateStr || '', ZT.date.x * W, ZT.date.y * H);
  ctx.font = font(ZT.time.size, true);
  ctx.fillText(data.timeStr || '', ZT.time.x * W, ZT.time.y * H);

  block(data.composition || '', ZT.composition);
}

/* ============================ тестовая этикетка ============================ */

export function drawTestLabel(ctx, opts) {
  const { widthMm, heightMm, pxPerMm, dpi, fontFamily = 'Arial', brand = '#F2661F', barcode = null } = opts;
  const mm = (v) => v * pxPerMm;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, mm(widthMm), mm(heightMm));
  ctx.textBaseline = 'top';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(1, mm(0.3));
  ctx.strokeRect(mm(0.5), mm(0.5), mm(widthMm) - mm(1), mm(heightMm) - mm(1));
  ctx.fillStyle = '#000';
  ctx.font = `${mm(2.2)}px ${fontFamily}`;
  for (let x = 0; x <= widthMm; x += 10) {
    ctx.beginPath();
    ctx.moveTo(mm(x), mm(0.5));
    ctx.lineTo(mm(x), mm(x % 50 === 0 ? 6 : 3.5));
    ctx.stroke();
    if (x % 20 === 0 && x > 0 && x < widthMm) ctx.fillText(String(x), mm(x) + mm(0.6), mm(6.5));
  }
  for (let yv = 0; yv <= heightMm; yv += 10) {
    ctx.beginPath();
    ctx.moveTo(mm(0.5), mm(yv));
    ctx.lineTo(mm(yv % 50 === 0 ? 6 : 3.5), mm(yv));
    ctx.stroke();
    if (yv % 20 === 0 && yv > 0 && yv < heightMm) ctx.fillText(String(yv), mm(1), mm(yv) + mm(0.6));
  }
  ctx.strokeStyle = '#bbb';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(mm(widthMm), mm(heightMm));
  ctx.moveTo(mm(widthMm), 0);
  ctx.lineTo(0, mm(heightMm));
  ctx.stroke();
  if (heightMm < 60) {
    // компактный носитель (80×50): всё мельче и плотнее, чтобы не уходило за край
    ctx.fillStyle = brand;
    ctx.beginPath();
    ctx.moveTo(mm(10), mm(13));
    ctx.lineTo(mm(13), mm(13));
    ctx.lineTo(mm(11.5), mm(10));
    ctx.closePath();
    ctx.fill();
    ctx.font = `bold ${mm(3)}px ${fontFamily}`;
    ctx.fillText('подача / feed', mm(14.5), mm(10));
    ctx.fillStyle = '#000';
    ctx.font = `bold ${mm(2.8)}px ${fontFamily}`;
    ctx.fillText(`${widthMm} × ${heightMm} мм  •  ${dpi || ''} dpi`, mm(10), mm(15));
    ctx.font = `${mm(2.1)}px ${fontFamily}`;
    ctx.fillText('Epson ColorWorks CW-C4030 — тест', mm(10), mm(19.3));
    ctx.fillText(new Date().toLocaleString('ru-RU'), mm(10), mm(22.3));
    if (barcode && barcode.image) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(barcode.image, mm(10), mm(26.5), mm(30), mm(11.5));
      ctx.restore();
      ctx.font = `${mm(2.1)}px ${fontFamily}`;
      ctx.fillText('1234567890128', mm(10), mm(38.6));
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = brand;
  ctx.beginPath();
  ctx.moveTo(mm(12), mm(heightMm / 2 - 8));
  ctx.lineTo(mm(16), mm(heightMm / 2 - 8));
  ctx.lineTo(mm(14), mm(heightMm / 2 - 12));
  ctx.closePath();
  ctx.fill();
  ctx.font = `bold ${mm(4)}px ${fontFamily}`;
  ctx.fillText('подача / feed', mm(18), mm(heightMm / 2 - 12));
  ctx.fillStyle = '#000';
  ctx.font = `bold ${mm(3.6)}px ${fontFamily}`;
  ctx.fillText(`${widthMm} × ${heightMm} мм  •  ${dpi || ''} dpi`, mm(12), mm(heightMm / 2 - 4));
  ctx.font = `${mm(3)}px ${fontFamily}`;
  ctx.fillText('Epson ColorWorks CW-C4030 — тестовая печать', mm(12), mm(heightMm / 2 + 2));
  ctx.fillText(new Date().toLocaleString('ru-RU'), mm(12), mm(heightMm / 2 + 8));
  if (barcode && barcode.image) {
    const dw = mm(46);
    const dh = (barcode.height / barcode.width) * dw;
    ctx.drawImage(barcode.image, mm(12), mm(heightMm - 20), dw, dh);
    ctx.fillStyle = '#000';
    ctx.font = `${mm(2.6)}px ${fontFamily}`;
    ctx.fillText('1234567890128', mm(12), mm(heightMm - 20) + dh + mm(1));
  }
  ctx.restore();
}
