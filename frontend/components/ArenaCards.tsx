import React, { useEffect, useMemo, useState } from 'react';
import { callRansenControl } from '../supabase';
import { GamePhase } from '../types';

interface Props {
  t: (key: string) => string;
  arenaName: string;
  active?: boolean;
}

type ArenaStatus = {
  phase: GamePhase | null | undefined;
  arenaName?: string;
};

const ArenaCards: React.FC<Props> = ({ t, arenaName, active = false }) => {
  const isDisasterArena = new URLSearchParams(window.location.search).get('arena') === 'bousai-toyama';
  const selectedPhase = active ? GamePhase.LOBBY : GamePhase.OFF;
  const [statuses, setStatuses] = useState<Record<'main' | 'bousai-toyama', ArenaStatus>>({
    main: {
      phase: isDisasterArena ? undefined : selectedPhase,
      arenaName: isDisasterArena ? undefined : arenaName,
    },
    'bousai-toyama': {
      phase: isDisasterArena ? selectedPhase : undefined,
    },
  });

  const urls = useMemo(() => {
    const disaster = new URL(window.location.href);
    disaster.searchParams.set('arena', 'bousai-toyama');
    const main = new URL(window.location.href);
    main.searchParams.delete('arena');
    return { disaster: disaster.toString(), main: main.toString() };
  }, []);

  useEffect(() => {
    setStatuses((current) => ({
      ...current,
      [isDisasterArena ? 'bousai-toyama' : 'main']: {
        ...current[isDisasterArena ? 'bousai-toyama' : 'main'],
        phase: selectedPhase,
        ...(isDisasterArena ? {} : { arenaName }),
      },
    }));
  }, [arenaName, isDisasterArena, selectedPhase]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const [main, disaster] = await Promise.all([
        callRansenControl('GET', undefined, 'main'),
        callRansenControl('GET', undefined, 'bousai-toyama'),
      ]);
      if (cancelled) return;
      setStatuses((current) => ({
        main: {
          phase: main.ok && main.phase ? main.phase : null,
          arenaName: main.ok && main.arenaName ? main.arenaName : current.main.arenaName,
        },
        'bousai-toyama': {
          phase: disaster.ok && disaster.phase ? disaster.phase : null,
          arenaName: disaster.ok && disaster.arenaName ? disaster.arenaName : current['bousai-toyama'].arenaName,
        },
      }));
    };

    void refresh();
    const interval = window.setInterval(refresh, 5000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  const statusLabel = (phase: ArenaStatus['phase']) => {
    if (phase === undefined) return t('arena.loading');
    if (phase === null) return t('arena.unavailable');
    if (phase === GamePhase.LOBBY) return t('arena.open');
    if (phase === GamePhase.PLAYING) return t('arena.playing');
    if (phase === GamePhase.THEATER) return t('arena.results');
    return t('arena.closed');
  };

  const statusDot = (phase: ArenaStatus['phase']) => {
    if (phase === GamePhase.LOBBY) return 'bg-emerald-400 animate-pulse';
    if (phase === GamePhase.PLAYING) return 'bg-rose-400 animate-pulse';
    if (phase === GamePhase.THEATER) return 'bg-amber-400';
    return 'bg-slate-500';
  };

  return <div className="grid grid-cols-2 gap-3 w-full max-w-lg" aria-label={t('arena.title')}>
    <a href={urls.main} aria-current={!isDisasterArena ? 'page' : undefined} className={`rounded-2xl border p-4 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 ${!isDisasterArena ? 'border-emerald-300 shadow-[0_0_25px_rgba(52,211,153,.25)]' : 'border-white/15'}`}>
      <div className="text-[10px] uppercase tracking-[.2em] text-emerald-300 font-black">{t('arena.default')}</div>
      <div className="text-xl text-white font-black mt-1">🦐 {statuses.main.arenaName || t('arena.default')}</div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-300">
        <span className={`h-2 w-2 rounded-full ${statusDot(statuses.main.phase)}`} />
        {statusLabel(statuses.main.phase)}
      </div>
    </a>
    <a href={urls.disaster} aria-current={isDisasterArena ? 'page' : undefined} className={`rounded-2xl border bg-gradient-to-br from-orange-500/20 to-rose-500/10 p-4 text-left transition-all hover:border-orange-200 hover:bg-orange-500/20 ${isDisasterArena ? 'border-orange-200 shadow-[0_0_25px_rgba(251,146,60,.25)]' : 'border-orange-300/40'}`}>
      <div className="text-[10px] uppercase tracking-[.2em] text-orange-300 font-black">{t('arena.permanent')}</div>
      <div className="mt-1 text-lg font-black text-white">⛑️ {t('arena.disaster')}</div>
      <div className="mt-1 text-xs text-slate-400">{t('arena.disasterOnly')}</div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-300">
        <span className={`h-2 w-2 rounded-full ${statusDot(statuses['bousai-toyama'].phase)}`} />
        {statusLabel(statuses['bousai-toyama'].phase)}
      </div>
    </a>
  </div>;
};

export default ArenaCards;
