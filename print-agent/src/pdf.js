import PDFDocument from 'pdfkit';

const MM_TO_PT = 72 / 25.4;

/**
 * PNG этикетки -> PDF: N страниц физического размера, поля 0, + `blank` белых страниц в конце
 * (тот же размер; вся тиражная пачка — одно задание печати → один Cut в конце).
 * Белая страница залита белым прямоугольником, чтобы ни один обработчик не выкинул её как пустую.
 */
export function buildPdf(pngBuffer, { widthMm, heightMm, copies = 1, copiesMode = 'pages', blank = 0 }) {
  const b = Math.max(0, Math.min(5, Number(blank) || 0));
  // при пустой этикетке копии драйвера нельзя: драйвер повторил бы и пустую страницу
  const n = copiesMode === 'driver' && !b ? 1 : Math.max(1, Math.min(999, Number(copies) || 1));
  const wPt = widthMm * MM_TO_PT;
  const hPt = heightMm * MM_TO_PT;
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [wPt, hPt], margin: 0, autoFirstPage: false });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      for (let i = 0; i < n; i++) {
        doc.addPage({ size: [wPt, hPt], margin: 0 });
        doc.image(pngBuffer, 0, 0, { width: wPt, height: hPt });
      }
      for (let i = 0; i < b; i++) {
        doc.addPage({ size: [wPt, hPt], margin: 0 });
        doc.rect(0, 0, wPt, hPt).fill('#FFFFFF');
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
