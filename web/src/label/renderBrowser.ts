// @ts-ignore — общий JS-модуль
import { drawLabel, drawTestLabel } from '../shared/labelDraw.js';
import JsBarcode from 'jsbarcode';

const FMT: Record<string, string> = {
  code128: 'CODE128',
  code39: 'CODE39',
  ean13: 'EAN13',
  ean8: 'EAN8',
  upc: 'UPC',
};

export interface RenderParams {
  widthMm: number;
  heightMm: number;
  dpi: number;
  safeMm: number;
  symbology: string;
  brandColor?: string;
  useTemplate?: boolean;
}

// Фон-макет (фирменная картинка) — грузим один раз.
let templatePromise: Promise<HTMLImageElement | null> | null = null;
function loadTemplate(): Promise<HTMLImageElement | null> {
  if (!templatePromise) {
    templatePromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = '/label-template.png';
    });
  }
  return templatePromise;
}

export function makeBarcode(value: string, symbology: string) {
  if (!value || symbology === 'qrcode') return null;
  const c = document.createElement('canvas');
  try {
    JsBarcode(c, String(value), {
      format: FMT[symbology] || 'CODE128',
      displayValue: false,
      margin: 0,
      height: 70,
      width: 2,
      background: '#ffffff',
    });
  } catch {
    return null;
  }
  return { image: c, width: c.width, height: c.height };
}

/** Асинхронный рендер: дожидается фон-макета. */
export async function renderLabelAsync(canvas: HTMLCanvasElement, data: any, rp: RenderParams) {
  const pxPerMm = (rp.dpi || 300) / 25.4;
  canvas.width = Math.round(rp.widthMm * pxPerMm);
  canvas.height = Math.round(rp.heightMm * pxPerMm);
  const ctx = canvas.getContext('2d')!;
  const barcode = makeBarcode(data.barcodeValue, data.symbology || rp.symbology);
  const templateImage = rp.useTemplate === false ? null : await loadTemplate();
  drawLabel(ctx, {
    widthMm: rp.widthMm,
    heightMm: rp.heightMm,
    pxPerMm,
    safeMm: rp.safeMm,
    data,
    templateImage,
    barcode,
  });
}

/** Синхронный рендер (совместимость): если макет ещё не загружен — рисует резервный, потом перерисует. */
export function renderLabel(canvas: HTMLCanvasElement, data: any, rp: RenderParams) {
  renderLabelAsync(canvas, data, rp);
}

export function renderTest(canvas: HTMLCanvasElement, rp: RenderParams) {
  const pxPerMm = (rp.dpi || 300) / 25.4;
  canvas.width = Math.round(rp.widthMm * pxPerMm);
  canvas.height = Math.round(rp.heightMm * pxPerMm);
  const ctx = canvas.getContext('2d')!;
  let barcode = null;
  try {
    const c = document.createElement('canvas');
    JsBarcode(c, '1234567890128', { format: 'EAN13', displayValue: false, margin: 0, height: 70, background: '#fff' });
    barcode = { image: c, width: c.width, height: c.height };
  } catch {
    /* no-op */
  }
  drawTestLabel(ctx, {
    widthMm: rp.widthMm,
    heightMm: rp.heightMm,
    pxPerMm,
    dpi: rp.dpi,
    brand: rp.brandColor || '#F2661F',
    barcode,
  });
}
