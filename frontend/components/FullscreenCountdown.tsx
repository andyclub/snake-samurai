import React, { useEffect } from 'react';
import { audio } from '../audio';

interface Props {
  value: number;
  label: string;
  active?: boolean;
}

const FullscreenCountdown: React.FC<Props> = ({ value, label, active = true }) => {
  const visible = active && value >= 1 && value <= 5;

  useEffect(() => {
    if (visible) audio.playCountdown(value);
  }, [value, visible]);

  if (!visible) return null;

  return (
    <div key={value} className="countdown-screen fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden" aria-live="assertive">
      <div className="countdown-flash absolute inset-0" />
      <div className="countdown-ring absolute w-[70vmin] h-[70vmin] rounded-full border-[3vmin] border-emerald-300/80" />
      <div className="relative text-center countdown-impact">
        <p className="text-emerald-200 font-black tracking-[.4em] text-sm sm:text-xl drop-shadow-lg mb-2">{label}</p>
        <div className="text-[55vmin] leading-[.72] font-black italic text-white drop-shadow-[0_0_45px_rgba(52,211,153,1)]">{value}</div>
      </div>
    </div>
  );
};

export default FullscreenCountdown;
