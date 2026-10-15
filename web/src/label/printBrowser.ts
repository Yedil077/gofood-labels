import { renderLabelAsync, type RenderParams } from './renderBrowser';

/**
 * Печать этикетки напрямую через браузер (без Print Agent).
 * Открывает окно с изображением этикетки в физическом размере и вызывает диалог печати.
 * Пользователь выбирает принтер, ставит «Поля: нет» и «Масштаб: 100%».
 */
export async function printViaBrowser(data: any, rp: RenderParams, copies = 1, blank = 0) {
  const canvas = document.createElement('canvas');
  await renderLabelAsync(canvas, data, rp);
  const url = canvas.toDataURL('image/png');
  const n = Math.max(1, Math.min(999, Math.round(copies)));

  // Пустая этикетка — такая же картинка того же размера, только целиком белая:
  // тот же элемент и те же размеры → без смещений; последней страницей ТОГО ЖЕ документа
  // (одно задание печати → один Cut в конце тиража).
  const b = Math.max(0, Math.min(5, Math.round(blank)));
  let blankUrl = '';
  if (b) {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    blankUrl = c.toDataURL('image/png');
  }

  const w = window.open('', 'gofood_print', 'width=480,height=360');
  if (!w) {
    alert('Браузер заблокировал окно печати. Разрешите всплывающие окна для этого сайта и повторите.');
    return;
  }

  const srcs = [...Array.from({ length: n }, () => url), ...Array.from({ length: b }, () => blankUrl)];
  const imgs = srcs
    .map((s, i) => `<img class="lbl${i === srcs.length - 1 ? ' last' : ''}" src="${s}" alt="этикетка"/>`)
    .join('');

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Печать этикетки</title>
<style>
  @page { size: ${rp.widthMm}mm ${rp.heightMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .lbl { width: ${rp.widthMm}mm; height: ${rp.heightMm}mm; display: block; page-break-after: always; }
  .lbl.last { page-break-after: auto; }
  @media screen {
    body { padding: 16px; font: 14px system-ui, sans-serif; }
    .hint { margin-bottom: 12px; color: #444; }
    .lbl { outline: 1px dashed #bbb; margin-bottom: 8px; }
  }
  @media print { .hint { display: none; } }
</style></head><body>
<div class="hint">В диалоге печати выберите принтер <b>EPSON CW-C4030</b>, «Поля» = <b>Нет</b>, «Масштаб» = <b>100%</b> (не «Вписать»).</div>
${imgs}
<script>
  var im = document.images[0];
  function go(){ try { window.focus(); window.print(); } catch(e){} }
  if (im && !im.complete) { im.onload = go; im.onerror = go; } else { go(); }
  window.onafterprint = function(){ setTimeout(function(){ window.close(); }, 300); };
</script>
</body></html>`);
  w.document.close();
}
