import { useState } from "react";
import { readMix, setMusicVolume, setSfxVolume, unlockAudio } from "../audio.js";

export function SoundMix() {
  const [music, setMusic] = useState(() => Math.round(readMix().music * 100));
  const [sfx, setSfx] = useState(() => Math.round(readMix().sfx * 100));
  return (
    <div className="mix">
      <label>Música
        <input type="range" min={0} max={100} value={music} onChange={(event) => {
          const next = Number(event.target.value);
          setMusic(next);
          setMusicVolume(next / 100);
          unlockAudio();
        }} />
      </label>
      <label>Efeitos
        <small>Ataques, dano e interface. A música fica à parte.</small>
        <input type="range" min={0} max={100} value={sfx} onChange={(event) => {
          const next = Number(event.target.value);
          setSfx(next);
          setSfxVolume(next / 100);
          unlockAudio();
        }} />
      </label>
    </div>
  );
}
