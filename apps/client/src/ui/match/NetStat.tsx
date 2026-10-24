import { useEffect, useState } from "react";
import { renderStats } from "../../game/frame.js";

export function NetStat({ netRef }: { netRef: { current: { ping: number; arrivals: number[] } } }) {
  const [text, setText] = useState("fps — · ping — · lat — · loss —");
  useEffect(() => {
    let frames = 0;
    let then = performance.now();
    let timer = 0;
    const loop = () => {
      frames += 1;
      timer = requestAnimationFrame(loop);
    };
    timer = requestAnimationFrame(loop);
    const report = window.setInterval(() => {
      const now = performance.now();
      const fps = Math.round(frames * 1000 / Math.max(1, now - then));
      frames = 0;
      then = now;
      const windowMs = 2000;
      const arrivals = netRef.current.arrivals.filter((at) => now - at <= windowMs);
      netRef.current.arrivals = arrivals;
      const expected = windowMs / 100;
      const loss = arrivals.length < 8 ? 0 : Math.max(0, Math.round((1 - arrivals.length / expected) * 100));
      const ping = netRef.current.ping;
      const pingText = ping < 0 ? "—" : `${Math.round(ping)}`;
      const latText = ping < 0 ? "—" : `${Math.round(ping / 2)}`;
      setText(`fps ${fps} · ping ${pingText} · lat ${latText} · loss ${loss}% · ents ${renderStats.entities} · html ${renderStats.html}`);
    }, 500);
    return () => {
      cancelAnimationFrame(timer);
      window.clearInterval(report);
    };
  }, [netRef]);
  return <p className="netstat">{text}</p>;
}
