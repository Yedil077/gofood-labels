import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import bwipjs from 'bwip-js';
// общий код отрисовки (один и тот же, что в браузере)
import { drawLabel, drawTestLabel } from '../../web/src/shared/labelDraw.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, '..', 'fonts');
let FONT_FAMILY = 'Arial';
try {
  if (fs.existsSync(FONT_DIR)) {
    for (const f of fs.readdirSync(FONT_DIR)) {
      if (/\.(ttf|otf)$/i.test(f)) {
        GlobalFonts.registerFromPath(path.join(FONT_DIR, f), 'LabelFont');
        FONT_FAMILY = 'LabelFont';
      }
    }
  }
} catch {
  /* no-op */
}
const FF = `${FONT_FAMILY}, Arial, sans-serif`;

// Фон-макет (фирменная картинка). Грузим один раз.
const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'label-template.png');
let templateImagePromise = null;
function getTemplate() {
  if (templateImagePromise === null) {
    templateImagePromise = fs.existsSync(TEMPLATE_PATH)
      ? loadImage(TEMPLATE_PATH).catch(() => null)
      : Promise.resolve(null);
  }
  return templateImagePromise;
}

async function barcodeImage(value, bcid) {
  if (!value) return null;
  try {
    const png = await bwipjs.toBuffer({
      bcid: bcid || 'code128',
      text: String(value),
      scale: 4,
      height: bcid === 'qrcode' ? 12 : 10,
      includetext: false,
      paddingwidth: 0,
      paddingheight: 0,
      backgroundcolor: 'FFFFFF',
    });
    const img = await loadImage(png);
    return { image: img, width: img.width, height: img.height };
  } catch {
    return null;
  }
}

function rotate(canvas, deg, W, H) {
  const r = ((deg % 360) + 360) % 360;
  if (r === 0) return canvas;
  const out = r === 90 || r === 270 ? createCanvas(H, W) : createCanvas(W, H);
  const o = out.getContext('2d');
  o.translate(out.width / 2, out.height / 2);
  o.rotate((r * Math.PI) / 180);
  o.drawImage(canvas, -W / 2, -H / 2);
  return out;
}

/**
 * Рендерит задание в PNG строго физического размера.
 * @param {object} job  задание из очереди (job.label, job.render, job.kind)
 */
export async function renderJob(job) {
  const rp = job.render || {};
  const widthMm = Number(rp.widthMm) || 100;
  const heightMm = Number(rp.heightMm) || 70;
  const dpi = Number(rp.dpi) || 300;
  const pxPerMm = dpi / 25.4;
  const W = Math.round(widthMm * pxPerMm);
  const H = Math.round(heightMm * pxPerMm);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  if (job.kind === 'test') {
    const bc = await barcodeImage('1234567890128', 'ean13');
    drawTestLabel(ctx, {
      widthMm,
      heightMm,
      pxPerMm,
      dpi,
      fontFamily: FF,
      brand: rp.brandColor || '#F2661F',
      barcode: bc,
    });
  } else {
    const data = job.label || {};
    const bc = await barcodeImage(data.barcodeValue, data.symbology || rp.symbology);
    const templateImage = rp.useTemplate === false ? null : await getTemplate();
    drawLabel(ctx, {
      widthMm,
      heightMm,
      pxPerMm,
      safeMm: Number(rp.safeMm) || 3,
      data,
      fontFamily: FF,
      templateImage,
      barcode: bc,
    });
  }

  const finalCanvas = rotate(canvas, Number(rp.printRotationDeg) || 0, W, H);
  const rotated = (Number(rp.printRotationDeg) || 0) % 180 !== 0;
  return {
    buffer: finalCanvas.toBuffer('image/png'),
    widthMm: rotated ? heightMm : widthMm,
    heightMm: rotated ? widthMm : heightMm,
  };
}
