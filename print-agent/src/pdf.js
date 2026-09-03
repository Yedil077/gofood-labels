import PDFDocument from 'pdfkit';

const MM_TO_PT = 72 / 25.4;

/** PNG этикетки -> PDF: N страниц физического размера, поля 0. */
export function buildPdf(pngBuffer, { widthMm, heightMm, copies = 1, copiesMode = 'pages' }) {
  const n = copiesMode === 'driver' ? 1 : Math.max(1, Math.min(999, Number(copies) || 1));
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
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
