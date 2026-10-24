import { useEffect, useRef } from "react";
import { loadIdle } from "../game/sprites.js";

export function HeroSprite({ view, shadow }: { view: string; shadow?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stop = false;
    let timer = 0;
    void loadIdle(view).then((sheet) => {
      if (stop) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const scale = 3;
      canvas.width = Math.max(1, Math.round(sheet.frameW * scale));
      canvas.height = Math.max(1, Math.round(sheet.frameH * scale));
      ctx.imageSmoothingEnabled = false;
      let frame = 0;
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(sheet.image, (sheet.start + frame) * sheet.frameW, 0, sheet.frameW, sheet.frameH, 0, 0, canvas.width, canvas.height);
        frame = (frame + 1) % Math.max(1, sheet.count);
      };
      draw();
      timer = window.setInterval(draw, 180);
    });
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [view]);
  return (
    <span className="hero-preview">
      {shadow ? <i className="hero-shadow" style={{ background: shadow }} /> : null}
      <canvas ref={ref} className="hero-sprite" />
    </span>
  );
}

export function ShadowPick({ colors, value, onPick }: { colors: string[]; value: string; onPick: (color: string) => void }) {
  if (colors.length === 0) return null;
  return (
    <div>
      <p className="eyebrow">sombra</p>
      <div className="swatches">
        {colors.map((color) => (
          <button key={color} type="button" className={color === value ? "on" : ""} style={{ background: color }} aria-label={`Sombra ${color}`} onClick={() => onPick(color)} />
        ))}
      </div>
    </div>
  );
}
