import React from 'react';

interface Props {
  t: (key: string) => string;
  arenaName: string;
  active?: boolean;
}

const ArenaCards: React.FC<Props> = ({ t, arenaName, active = false }) => {
  const isDisasterArena = new URLSearchParams(window.location.search).get('arena') === 'bousai-toyama';
  const disasterArena = new URL(window.location.href);
  disasterArena.searchParams.set('arena', 'bousai-toyama');
  const defaultArena = new URL(window.location.href);
  defaultArena.searchParams.delete('arena');
  return <div className="grid grid-cols-2 gap-3 w-full max-w-lg" aria-label={t('arena.title')}>
    <a href={defaultArena.toString()} className={`rounded-2xl border p-4 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 ${active && !isDisasterArena ? 'border-emerald-300 shadow-[0_0_25px_rgba(52,211,153,.25)]' : 'border-white/15'}`}>
      <div className="text-[10px] uppercase tracking-[.2em] text-emerald-300 font-black">{t('arena.default')}</div>
      <div className="text-xl text-white font-black mt-1">🦐 {arenaName}</div>
      <div className="text-xs text-slate-400 mt-1">{active ? t('arena.open') : t('arena.closed')}</div>
    </a>
    <a href={disasterArena.toString()} className={`rounded-2xl border bg-gradient-to-br from-orange-500/20 to-rose-500/10 p-4 text-left transition-all hover:border-orange-200 hover:bg-orange-500/20 ${active && isDisasterArena ? 'border-orange-200 shadow-[0_0_25px_rgba(251,146,60,.25)]' : 'border-orange-300/40'}`}>
      <div className="text-[10px] uppercase tracking-[.2em] text-orange-300 font-black">常設場</div>
      <div className="mt-1 text-lg font-black text-white">⛑️ 日本・富山市防災</div>
      <div className="mt-1 text-xs text-slate-400">防災問題限定</div>
    </a>
  </div>;
};

export default ArenaCards;
