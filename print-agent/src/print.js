import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

let ptp = null;
async function getPtp() {
  if (ptp) return ptp;
  try {
    const m = await import('pdf-to-printer');
    ptp = m.default || m;
  } catch {
    ptp = null;
  }
  return ptp;
}

export async function listPrinters() {
  if (process.platform !== 'win32') return [];
  const p = await getPtp();
  try {
    const l = await p?.getPrinters?.();
    return (l || []).map((x) => (typeof x === 'string' ? x : x.name)).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @param {Buffer} pdf
 * @param {{printer?:string,copies?:number,copiesMode?:string,scale?:string,dryRun?:boolean,tag?:string}} opts
 */
export async function printPdf(pdf, opts = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(OUT_DIR, `${opts.tag || 'job'}_${stamp}.pdf`);
  fs.writeFileSync(file, pdf);

  if (opts.dryRun || process.platform !== 'win32') {
    return { ok: true, via: 'dry-run', file };
  }
  const p = await getPtp();
  if (!p?.print) return { ok: false, via: 'none', file, error: 'pdf-to-printer недоступен' };

  const o = { scale: opts.scale || 'noscale', silent: true };
  if (opts.printer) o.printer = opts.printer;
  if (opts.copiesMode === 'driver' && opts.copies > 1) o.copies = Number(opts.copies);

  const timeoutMs = Number(opts.timeoutMs) || 60000;
  try {
    await Promise.race([
      p.print(file, o),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`таймаут печати ${timeoutMs / 1000}с`)), timeoutMs)),
    ]);
    return { ok: true, via: 'pdf-to-printer', file, printer: opts.printer || '(default)' };
  } catch (e) {
    return { ok: false, via: 'pdf-to-printer', file, error: String(e?.message || e) };
  }
}
