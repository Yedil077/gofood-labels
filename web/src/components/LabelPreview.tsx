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

  const boxW = 380;
  const cssW = oneToOne ? `${rp.widthMm}mm` : `${boxW}px`;
  const cssH = oneToOne ? `${rp.heightMm}mm` : `${Math.round((boxW * rp.heightMm) / rp.widthMm)}px`;

  return (
    <div className="preview-box">
      <div className="preview-cap">
        PREVIEW ЭТИКЕТКИ · {rp.widthMm} × {rp.heightMm} мм
      </div>
      <div className="preview-frame" style={{ width: cssW, height: cssH }}>
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
