import { useEffect, useRef, useState } from 'react';
import { renderLabel, type RenderParams } from '../label/renderBrowser';

interface Props {
  data: any;
  rp: RenderParams;
}

export default function LabelPreview({ data, rp }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [oneToOne, setOneToOne] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      try {
        renderLabel(canvasRef.current, data, rp);
      } catch (e) {
        /* no-op */
      }
    }
  }, [JSON.stringify(data), JSON.stringify(rp)]);

  // по ширине колонки, пропорции носителя; круг — не шире 340 px
  const round = rp.widthMm === rp.heightMm;
  const frameStyle = oneToOne
    ? { width: `${rp.widthMm}mm`, height: `${rp.heightMm}mm` }
    : { width: '100%', maxWidth: round ? 340 : 460, aspectRatio: `${rp.widthMm} / ${rp.heightMm}` };

  return (
    <div className="preview-box">
      <div className="preview-cap">
        ПРЕВЬЮ ЭТИКЕТКИ · {round ? `круг Ø${rp.widthMm} мм` : `${rp.widthMm} × ${rp.heightMm} мм`}
      </div>
      <div className="preview-frame" style={frameStyle}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
      <label className="row" style={{ gap: 6, cursor: 'pointer', fontSize: 12 }}>
        <input type="checkbox" checked={oneToOne} onChange={(e) => setOneToOne(e.target.checked)} />
        Масштаб 1:1 (физический размер)
      </label>
      <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
        Превью рисуется тем же кодом, что и печать. Штрихкод и точный размер — на этикетке с принтера.
      </div>
    </div>
  );
}
