/**
 * Отрисовка этикетки на 2D-контексте канваса.
 * Работает одинаково в браузере (CanvasRenderingContext2D) и в Node (@napi-rs/canvas).
 *
 * ОСНОВНОЙ режим: фон = фирменная картинка-макет (`templateImage`, 1556×1011),
 * поверх подставляются только значения (название, категория, КБЖУ, штрихкод, дата/время, состав).
 * Заголовки полей, логотип, слоган, рамки и нижний блок «Хранить…» уже в картинке.
 *
 * Если `templateImage` не передан — рисуется резервный векторный макет (drawLabelFallback).
 *
 * `barcode` — уже готовое изображение штрихкода (browser: <canvas>/ImageBitmap, node: Image).
 */

const fmtNum = (v) => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

/* Зоны для значений — доли от размера макета (1556×1011). Измерено по картинке. */
const Z = {
  composition: { x: 0.032, y: 0.602, w: 0.260, h: 0.330, size: 0.0225, min: 0.017, lines: 13, lh: 1.26 },
  name: { x: 0.334, y: 0.246, w: 0.628, h: 0.150, size: 0.040, min: 0.026, lines: 3, lh: 1.06, bold: true },
  category: { x: 0.334, y: 0.492, w: 0.298, h: 0.055, size: 0.030, min: 0.020, lines: 2, lh: 1.1 },
  kbju: { x: 0.676, y: 0.478, w: 0.300, h: 0.095, size: 0.026, min: 0.019, lh: 1.3 },
  barcode: { x: 0.333, y: 0.665, w: 0.300, h: 0.076 },
  barcodeText: { x: 0.333, y: 0.752, w: 0.300, size: 0.024 },
  date: { x: 0.677, y: 0.676, size: 0.043, bold: true },
  time: { x: 0.677, y: 0.723, size: 0.052, bold: true },
};

export function drawLabel(ctx, opts) {
  const { widthMm, heightMm, pxPerMm, data, templateImage = null, barcode = null } = opts;
  const fontFamily = opts.fontFamily || 'Arial, "Segoe UI", sans-serif';
  const W = widthMm * pxPerMm;
  const H = heightMm * pxPerMm;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  if (!templateImage) {
    drawLabelFallback(ctx, opts);
    ctx.restore();
    return;
  }

  // фон-макет во весь размер
  ctx.drawImage(templateImage, 0, 0, W, H);
  ctx.textBaseline = 'top';
  const INK = '#141210';

  const font = (frac, bold) => `${bold ? 'bold ' : ''}${Math.max(6, frac * H)}px ${fontFamily}`;

  function wrap(str, maxW, f) {
    ctx.font = f;
    const words = String(str).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (!cur || ctx.measureText(t).width <= maxW) cur = t;
      else {
        lines.push(cur);
        cur = wd;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function fitLines(str, maxWpx, maxLines, startFrac, minFrac, bold) {
    let s = startFrac;
    let lines = wrap(str, maxWpx, font(s, bold));
    let guard = 0;
    while (
      guard++ < 120 &&
      s > minFrac &&
      (lines.length > maxLines || lines.some((l) => ctx.measureText(l).width > maxWpx))
    ) {
      s = Math.max(minFrac, s - 0.0015);
      lines = wrap(str, maxWpx, font(s, bold));
    }
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      ctx.font = font(s, bold);
      let last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWpx) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return { lines, size: s };
  }

  function drawBlock(str, z) {
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
  }

  // --- название блюда ---
  drawBlock(data.name || '', Z.name);

  // --- категория ---
  drawBlock(data.category || '', Z.category);

  // --- КБЖУ (2 строки, пусто если данных нет) ---
  const k = data.kbju || {};
  if (k.protein != null || k.fat != null || k.carbs != null || k.kcal != null) {
    ctx.fillStyle = INK;
    ctx.font = font(Z.kbju.size, false);
    const step = Z.kbju.size * H * Z.kbju.lh;
    const x = Z.kbju.x * W;
    let y = Z.kbju.y * H;
    ctx.fillText(`Б: ${fmtNum(k.protein)} г    Ж: ${fmtNum(k.fat)} г`, x, y);
    ctx.fillText(`У: ${fmtNum(k.carbs)} г    Ккал: ${k.kcal == null ? '—' : Math.round(k.kcal)}`, x, y + step);
  }

  // --- штрихкод ---
  if (data.barcodeValue && barcode && barcode.image) {
    const bx = Z.barcode.x * W;
    const by = Z.barcode.y * H;
    const bw = Z.barcode.w * W;
    const bh = Z.barcode.h * H;
    const r = Math.min(bw / barcode.width, bh / barcode.height);
    const dw = barcode.width * r;
    const dh = barcode.height * r;
    ctx.drawImage(barcode.image, bx + (bw - dw) / 2, by, dw, dh);
    ctx.fillStyle = INK;
    ctx.font = font(Z.barcodeText.size, false);
    const t = data.barcodeValue;
    const tw = ctx.measureText(t).width;
    ctx.fillText(t, Z.barcodeText.x * W + (Z.barcodeText.w * W - tw) / 2, Z.barcodeText.y * H);
  } else if (data.barcodeValue) {
    ctx.fillStyle = INK;
    ctx.font = font(Z.barcode.h * 0.6, true);
    ctx.fillText(data.barcodeValue, Z.barcode.x * W, Z.barcode.y * H + Z.barcode.h * H * 0.2);
  }

  // --- дата / время ---
  ctx.fillStyle = INK;
  ctx.font = font(Z.date.size, Z.date.bold);
  ctx.fillText(data.dateStr || '', Z.date.x * W, Z.date.y * H);
  ctx.font = font(Z.time.size, Z.time.bold);
  ctx.fillText(data.timeStr || '', Z.time.x * W, Z.time.y * H);

  // --- состав ---
  drawBlock(data.composition || '', Z.composition);

  ctx.restore();
}

/* ======================= РЕЗЕРВНЫЙ ВЕКТОРНЫЙ МАКЕТ ======================= */

export function drawLabelFallback(ctx, opts) {
  const { widthMm, heightMm, pxPerMm, safeMm = 3, data } = opts;
  const barcode = opts.barcode || null;
  const FF = opts.fontFamily || 'Arial, "Segoe UI", sans-serif';
  const K = data.fontScale || 1;
  const mm = (v) => v * pxPerMm;
  const brand = data.brand?.color || '#F2661F';
  const GREY = '#8a8a8a';
  const LINE = '#dcdcdc';
  const INK = '#111111';

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, mm(widthMm), mm(heightMm));
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
    if (L.length > ml) L = L.slice(0, ml);
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
  const stripH = 8.5;
  const contentBottom = heightMm - stripH - 1;

  ctx.strokeStyle = LINE;
  ctx.lineWidth = Math.max(1, mm(0.3));
  ctx.strokeRect(mm(0.6), mm(0.6), mm(widthMm) - mm(1.2), mm(heightMm) - mm(1.2));
  ctx.beginPath();
  ctx.moveTo(mm(dividerX), mm(safeMm + 3));
  ctx.lineTo(mm(dividerX), mm(contentBottom));
  ctx.stroke();

  ctx.fillStyle = '#111';
  ctx.font = `bold ${mm(5.6)}px ${FF}`;
  ctx.fillText('gofood', mm(xL0), mm(safeMm + 10));
  text('Состав', xL0, safeMm + 22, 3.2, { bold: true });
  dotted(xL0, safeMm + 26.6, xL0 + xLw, safeMm + 26.6, brand);
  if (data.composition) lines(fit(data.composition, xLw, 22, 2.5, 1.8).lines, xL0, safeMm + 28, 2.5, { lh: 1.25 });

  let y = safeMm;
  if (data.brand?.tagline) {
    const t = fit(data.brand.tagline, rW - 4, 1, 2.7, 1.9, true);
    text(t.lines[0], xR0, y, t.size, { bold: true, color: brand });
    y += 4.2;
  }
  dotted(xR0, y, xR1, y, brand);
  y += 1.8;
  cap('Название блюда', xR0, y);
  y += 2.7;
  const nf = fit(data.name || '—', rW, 3, 4.6, 2.6, true);
  y = lines(nf.lines, xR0, y, nf.size, { bold: true, lh: 1.14 }) + 1.2;
  y = Math.min(y, contentBottom - 27);
  dotted(xR0, y, xR1, y, brand);
  y += 2;
  const cW = (rW - 3) / 2;
  const bx = xR0 + cW + 3;
  cap('Категория', xR0, y);
  if (data.category) lines(fit(data.category, cW, 3, 2.9, 2.1).lines, xR0, y + 2.6, 2.7, { lh: 1.15 });
  cap('КБЖУ', bx, y);
  const kk = data.kbju || {};
  if (kk.protein != null || kk.fat != null || kk.carbs != null || kk.kcal != null) {
    lines(
      [
        `Белки: ${fmtNum(kk.protein)} г`,
        `Жиры: ${fmtNum(kk.fat)} г`,
        `Углеводы: ${fmtNum(kk.carbs)} г`,
        `Ккал: ${kk.kcal == null ? '—' : Math.round(kk.kcal)}`,
      ],
      bx,
      y + 2.6,
      2.3,
      { lh: 1.2 }
    );
  }
  y += 14;
  dotted(xR0, y, xR1, y, brand);
  y += 2;
  cap('Штрихкод', xR0, y);
  if (data.barcodeValue && barcode && barcode.image) {
    const r = Math.min(mm(cW) / barcode.width, mm(9) / barcode.height);
    ctx.drawImage(barcode.image, mm(xR0), mm(y + 2.4), barcode.width * r, barcode.height * r);
    text(data.barcodeValue, xR0, y + 2.4 + (barcode.height * r) / pxPerMm + 0.8, 2.3);
  }
  cap('Дата / время изготовления', bx, y);
  text(data.dateStr || '—', bx, y + 3.4, 3.8, { bold: true });
  text(data.timeStr || '', bx, y + 8.4, 4.6, { bold: true });

  const stripY = heightMm - stripH;
  dotted(xL0, stripY, xR1, stripY, brand);
  ctx.fillStyle = brand;
  ctx.beginPath();
  ctx.arc(mm(xL0 + 3), mm(stripY + stripH / 2 + 0.3), mm(3), 0, Math.PI * 2);
  ctx.fill();
  lines(
    wrap(data.storageText || '', widthMm - (xL0 + 8) - safeMm, font(2.4, false)).slice(0, 2),
    xL0 + 8,
    stripY + 1.6,
    2.4,
    { lh: 1.15 }
  );
}

/** Калибровочная (тестовая) этикетка — без изменений. */
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
