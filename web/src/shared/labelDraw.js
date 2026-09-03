/**
 * Отрисовка этикетки на 2D-контексте канваса.
 * Работает одинаково в браузере (CanvasRenderingContext2D) и в Node (@napi-rs/canvas).
 * Никаких импортов, файлов, сети — только операции рисования.
 *
 * Штрихкод передаётся уже готовым изображением (browser: <canvas>/ImageBitmap,
 * node: Image из loadImage) в поле `barcode`.
 */

const fmtNum = (v) => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   widthMm:number, heightMm:number, pxPerMm:number, safeMm?:number,
 *   data:object, fontFamily?:string,
 *   barcode?:{image:any,width:number,height:number}|null
 * }} opts
 */
export function drawLabel(ctx, opts) {
  const {
    widthMm,
    heightMm,
    pxPerMm,
    safeMm = 3,
    data,
    fontFamily = 'Arial, "Segoe UI", sans-serif',
    barcode = null,
  } = opts;

  const K = data.fontScale || 1;
  const mm = (v) => v * pxPerMm;
  const brand = data.brand?.color || '#F2661F';
  const GREY = '#8a8a8a';
  const LINE = '#dcdcdc';
  const INK = '#111111';
  const FF = fontFamily;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, mm(widthMm), mm(heightMm));
  ctx.textBaseline = 'top';

  const font = (sizeMm, bold = false) =>
    `${bold ? 'bold ' : ''}${Math.max(6, mm(sizeMm * K))}px ${FF}`;

  const text = (str, xMm, yMm, sizeMm, { bold = false, color = INK } = {}) => {
    ctx.fillStyle = color;
    ctx.font = font(sizeMm, bold);
    ctx.fillText(str, mm(xMm), mm(yMm));
  };
  const caption = (str, xMm, yMm) => {
    ctx.fillStyle = GREY;
    ctx.font = font(1.9, true);
    ctx.fillText(String(str).toUpperCase(), mm(xMm), mm(yMm));
  };
  const dotted = (x1, y1, x2, y2, color = LINE) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, mm(0.22));
    ctx.setLineDash([mm(0.7), mm(0.8)]);
    ctx.beginPath();
    ctx.moveTo(mm(x1), mm(y1));
    ctx.lineTo(mm(x2), mm(y2));
    ctx.stroke();
    ctx.restore();
  };
  const wrap = (str, maxWmm, fontStr) => {
    ctx.font = fontStr;
    const words = String(str).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const wd of words) {
      const trial = cur ? cur + ' ' + wd : wd;
      if (!cur || ctx.measureText(trial).width <= mm(maxWmm)) cur = trial;
      else {
        lines.push(cur);
        cur = wd;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const fit = (str, maxWmm, maxLines, startMm, minMm, bold) => {
    let size = startMm;
    let lines = wrap(str, maxWmm, font(size, bold));
    let guard = 0;
    while (
      guard++ < 120 &&
      size > minMm &&
      (lines.length > maxLines || lines.some((l) => ctx.measureText(l).width > mm(maxWmm)))
    ) {
      size = Math.max(minMm, Math.round((size - 0.15) * 100) / 100);
      lines = wrap(str, maxWmm, font(size, bold));
    }
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      ctx.font = font(size, bold);
      let last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > mm(maxWmm)) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return { lines, size };
  };
  const drawLines = (lines, xMm, yMm, sizeMm, { bold = false, color = INK, lh = 1.16 } = {}) => {
    ctx.fillStyle = color;
    ctx.font = font(sizeMm, bold);
    const step = sizeMm * K * lh;
    let y = yMm;
    for (const l of lines) {
      ctx.fillText(l, mm(xMm), mm(y));
      y += step;
    }
    return y;
  };

  /* геометрия */
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

  /* левая колонка */
  drawLogo(ctx, mm, brand, FF, xL0, safeMm + 1, Math.min(14, xLw - 2));
  const compTop = safeMm + 24;
  text('Состав', xL0, compTop, 3.2, { bold: true });
  dotted(xL0, compTop + 4.6, xL0 + xLw, compTop + 4.6, brand);
  if (data.composition && data.composition.trim()) {
    const f = fit(data.composition, xLw, 22, 2.5, 1.8, false);
    drawLines(f.lines, xL0, compTop + 6.2, f.size, { lh: 1.25 });
  } else {
    text('не указан', xL0, compTop + 6.4, 2.3, { color: GREY });
    for (let i = 0; i < 5; i++) dotted(xL0, compTop + 12 + i * 4, xL0 + xLw, compTop + 12 + i * 4);
  }

  /* правая колонка */
  let y = safeMm;
  if (data.brand?.tagline) {
    ctx.save();
    ctx.fillStyle = brand;
    ctx.beginPath();
    ctx.ellipse(mm(xR0 + 1), mm(y + 1.3), mm(1.3), mm(0.7), -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const t = fit(data.brand.tagline, rW - 4, 1, 2.7, 1.9, true);
    text(t.lines[0], xR0 + 3.4, y, t.size, { bold: true });
    y += Math.max(3.4, t.size * K + 1.4);
  } else {
    y += 1;
  }
  dotted(xR0, y, xR1, y, brand);
  y += 1.8;

  caption('Название блюда', xR0, y);
  y += 2.7;
  const nf = fit(data.name || '—', rW, 3, 4.6, 2.6, true);
  y = drawLines(nf.lines, xR0, y, nf.size, { bold: true, lh: 1.14 }) + 1.2;
  y = Math.min(y, contentBottom - 27);
  dotted(xR0, y, xR1, y, brand);
  y += 2;

  const colGap = 3;
  const cW = (rW - colGap) / 2;
  const bx = xR0 + cW + colGap;
  const midTop = y;
  caption('Категория', xR0, midTop);
  if (data.category) {
    const cf = fit(data.category, cW, 3, 2.9, 2.1, false);
    drawLines(cf.lines, xR0, midTop + 2.6, cf.size, { lh: 1.15 });
  } else {
    text('не указана', xR0, midTop + 2.8, 2.5, { color: GREY });
  }
  caption('КБЖУ', bx, midTop);
  const k = data.kbju || {};
  const anyK = k.protein != null || k.fat != null || k.carbs != null || k.kcal != null;
  if (anyK) {
    drawLines(
      [
        `Белки: ${fmtNum(k.protein)} г`,
        `Жиры: ${fmtNum(k.fat)} г`,
        `Углеводы: ${fmtNum(k.carbs)} г`,
        `Ккал: ${fmtNum(k.kcal)}`,
      ],
      bx,
      midTop + 2.6,
      2.3,
      { lh: 1.2 }
    );
  } else {
    text('нет данных', bx, midTop + 2.8, 2.5, { color: GREY });
  }
  y = midTop + 14;
  dotted(xR0, y, xR1, y, brand);
  y += 2;

  const botTop = y;
  caption('Штрихкод', xR0, botTop);
  if (data.barcodeValue && barcode && barcode.image) {
    const boxW = mm(cW);
    const boxH = mm(data.symbology === 'qrcode' ? 13 : 9);
    const ratio = Math.min(boxW / barcode.width, boxH / barcode.height);
    const dw = barcode.width * ratio;
    const dh = barcode.height * ratio;
    ctx.drawImage(barcode.image, mm(xR0), mm(botTop + 2.4), dw, dh);
    if (data.showBarcodeText) {
      ctx.fillStyle = INK;
      ctx.font = font(2.3, false);
      const tw = ctx.measureText(data.barcodeValue).width;
      ctx.fillText(data.barcodeValue, mm(xR0) + Math.max(0, (dw - tw) / 2), mm(botTop + 2.4) + dh + mm(0.8));
    }
  } else if (data.barcodeValue) {
    text(data.barcodeValue, xR0, botTop + 4, 3, { bold: true });
    text('(штрихкод отрисует агент печати)', xR0, botTop + 8, 2, { color: GREY });
  } else {
    text('нет штрихкода', xR0, botTop + 5, 2.5, { color: GREY });
  }

  caption('Дата / время изготовления', bx, botTop);
  text(data.dateStr || '—', bx, botTop + 3.4, 3.8, { bold: true });
  text(data.timeStr || '', bx, botTop + 8.4, 4.6, { bold: true });

  /* нижняя полоса */
  const stripY = heightMm - stripH;
  dotted(xL0, stripY, xR1, stripY, brand);
  drawFridge(ctx, mm, brand, xL0 + 3, stripY + stripH / 2 + 0.3, 3);
  const stLines = wrap(data.storageText || '', widthMm - (xL0 + 8) - safeMm, font(2.4, false)).slice(0, 2);
  drawLines(stLines, xL0 + 8, stripY + 1.6, 2.4, { lh: 1.15 });

  ctx.restore();
}

function drawLogo(ctx, mm, color, FF, xMm, yMm, sizeMm) {
  const x = mm(xMm);
  const y = mm(yMm);
  const r = mm(sizeMm) / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, Math.PI * 0.12, Math.PI * 0.88, true);
  ctx.lineTo(x + r, y + mm(sizeMm) + mm(1.6));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = mm(0.62);
  const cx = x + r;
  const top = y + mm(2);
  const bot = y + r + mm(2);
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    ctx.moveTo(cx - mm(2.3) + i * mm(1), top);
    ctx.lineTo(cx - mm(2.3) + i * mm(1), top + mm(2.4));
  }
  ctx.moveTo(cx - mm(2.3), top + mm(2.4));
  ctx.lineTo(cx - mm(2.3), bot);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx + mm(2.1), top + mm(1.5), mm(1.35), mm(1.9), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + mm(2.1), top + mm(3.1));
  ctx.lineTo(cx + mm(2.1), bot);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${mm(5.6)}px ${FF}`;
  ctx.fillText('gofood', x - mm(0.5), y + mm(sizeMm) + mm(3));
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

/** Калибровочная (тестовая) этикетка. */
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
