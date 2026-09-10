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

export function drawLabel(ctx, opts) {
  const { widthMm, heightMm, pxPerMm, data } = opts;
  const useTemplate = opts.useTemplate !== false && opts.templateImage;
  const W = widthMm * pxPerMm;
  const H = heightMm * pxPerMm;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (useTemplate) drawWithTemplate(ctx, opts, W, H);
  else drawVector(ctx, opts);
  ctx.restore();
}

/* ============================= векторный макет ============================= */

function drawVector(ctx, opts) {
  const { widthMm, heightMm, pxPerMm, data } = opts;
  const safeMm = opts.safeMm || 3;
  const barcode = opts.barcode || null;
  const logo = opts.logoImage || null;
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
  const cap = (s, x, y) => {
    ctx.fillStyle = GREY;
    ctx.font = font(1.9, true);
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
    text(t.lines[0], sx, ty, t.size, { bold: true });
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
  if (k.protein != null || k.fat != null || k.carbs != null || k.kcal != null) {
    lines(
      [
        `Белки: ${fmtNum(k.protein)} г`,
        `Жиры: ${fmtNum(k.fat)} г`,
        `Углеводы: ${fmtNum(k.carbs)} г`,
        `Ккал: ${k.kcal == null ? '—' : Math.round(k.kcal)}`,
      ],
      bx,
      midTop + 2.3,
      2.1,
      { lh: 1.12 }
    );
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
