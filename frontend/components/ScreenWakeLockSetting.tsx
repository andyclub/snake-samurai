import React, { useRef, useState } from 'react';
import { Sun } from 'lucide-react';
import { WakeLockStatus } from '../wakeLockController';

interface Props {
  placement?: 'above' | 'below';
  enabled: boolean;
  status: WakeLockStatus;
  setEnabled: (enabled: boolean) => void;
  retry: () => void;
  t: (key: string) => string;
}
export default function ScreenWakeLockSetting({ enabled, status, setEnabled, retry, t, placement = 'above' }: Props) {
  const [expanded, setExpanded] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const [panelLeft, setPanelLeft] = useState(0);
  return <div className="relative pointer-events-auto">
    <button ref={anchor} type="button" aria-expanded={expanded} aria-label={t('wake.title')}
      onClick={() => {
        const x = anchor.current?.getBoundingClientRect().left || 0;
        const width = Math.min(256, window.innerWidth - 32);
        setPanelLeft(Math.max(16 - x, Math.min(0, window.innerWidth - 16 - x - width)));
        setExpanded(!expanded);
      }} title={t('wake.title') + ': ' + t('wake.' + status)}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-slate-900/90 text-white">
      <Sun className={status === 'active' ? 'h-5 w-5 text-amber-300' : 'h-5 w-5 text-slate-400'} />
    </button>
    {expanded && <div style={{ left: panelLeft }} className={`absolute ${placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'} z-50 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/20 bg-slate-950 p-3 text-left text-xs text-white shadow-xl`}>
      <label className="flex items-center justify-between gap-3 font-bold">
        <span>{t('wake.title')}</span>
        <input type="checkbox" role="switch" aria-label={t('wake.title')} checked={enabled} onChange={event => setEnabled(event.target.checked)} className="h-5 w-5 accent-cyan-400" />
      </label>
      <p role="status" className="mt-2 text-slate-300">{t('wake.' + status)}</p>
      {(status === 'failed' || status === 'released') && enabled && <button type="button" onClick={retry} className="mt-2 rounded-lg bg-cyan-400 px-3 py-2 font-bold text-slate-950">{t('wake.retry')}</button>}
    </div>}
  </div>;
}
