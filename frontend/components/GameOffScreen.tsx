import React, { useState } from 'react';
import HomeLink from './HomeLink';
import { Play, QrCode, X, HelpCircle } from 'lucide-react';
import { audio } from '../audio';
import SnakeFaqModal from './SnakeFaqModal';

interface Props {
  t: (key: string) => string;
  arenaName: string;
  gameUrl?: string;
}

const GameOffScreen: React.FC<Props> = ({ t, gameUrl = 'https://h.kazeabc.com' }) => {
  const [showInviteQr, setShowInviteQr] = useState(false);
  const [showHomeHelp, setShowHomeHelp] = useState(false);
  const helpTitle = t('homeHelp.title') === 'homeHelp.title' ? 'Homepage button guide' : t('homeHelp.title');

  return (
    <div className="w-full max-w-full h-full flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800">
      <button type="button" onClick={() => setShowHomeHelp(true)} aria-label={helpTitle} title={helpTitle} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-50 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-slate-800 text-amber-300"><HelpCircle /></button>
      {showHomeHelp && <SnakeFaqModal lang="en" playerName="" playerColor="#38bdf8" homeHelp homeHelpT={t} homeHelpItems={["offStart", "offArena", "invite", "feedback", "home", "connection", "closeItem"]} onClose={() => setShowHomeHelp(false)} />}
      <div className="text-center space-y-8 p-8 bg-black/30 rounded-2xl backdrop-blur-sm border border-white/10 max-w-2xl w-[calc(100%_-_2rem)] max-h-[calc(100dvh_-_2rem)] overflow-y-auto overflow-x-hidden overscroll-contain">
        <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
          {t('app.title')}
        </h1>
        
        <div className="py-4">
          <p className="text-2xl text-red-400 font-semibold animate-pulse">
            {t('status.off')}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2" aria-label={t('arena.title')}>
          {([
            ['snake-free', 'arena.freeLabel', 'arena.freeHint', '🟢'],
            ['snake-theme', 'arena.themeLabel', 'arena.themeHint', '🟡'],
            ['snake-disaster', 'arena.disasterLabel', 'arena.disasterHint', '🔴'],
          ] as const).map(([room, label, hint, icon]) => {
            const url = new URL(window.location.href);
            url.searchParams.set('arena', room);
            return <a key={room} href={url.toString()} className="min-w-0 rounded-2xl border border-white/15 bg-slate-900/80 p-3">
              <span className="text-xl">{icon}</span><h2 className="mt-1 text-sm font-black">{t(label)}</h2><p className="mt-1 text-xs text-slate-400">{t(hint)}</p>
            </a>;
          })}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex min-w-64 cursor-not-allowed items-center justify-center gap-3 rounded-2xl border border-slate-600 bg-gradient-to-r from-slate-700 to-slate-600 px-8 py-4 text-xl font-black text-slate-400 opacity-65 shadow-none"
          >
            <Play className="h-7 w-7" />
            {t('btn.startRound')}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-8 sm:gap-16 py-4">
          <a href="https://docs.google.com/forms/d/e/1FAIpQLSergjEZdyfpqHWrkKDZgaDsGGVd880dc38B1Axp7KD9DP6aRA/viewform" target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-16 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-6 py-4 font-black text-emerald-100 transition hover:bg-emerald-400/20">
            {t('feedback.form')}
          </a>

          <button
            type="button"
            onClick={() => { audio.playPop(); setShowInviteQr(true); }}
            className="inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-blue-300/25 bg-blue-400/10 px-6 py-4 font-black text-blue-100 shadow-[0_12px_35px_rgba(59,130,246,.12)] transition hover:border-blue-200/50 hover:bg-blue-400/20 active:scale-95"
          >
            <QrCode className="h-6 w-6" />
            {t('btn.inviteGame')}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 border-t border-white/10 pt-6">
          <span className="text-xs text-slate-400">V{__REPO_COMMIT_COUNT__} {__BUILD_DATE__} by <a href="https://h.kazeabc.com" target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:underline">h.kazeabc.com</a></span>
          <HomeLink />
        </div>

      </div>
      {showInviteQr && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-5 backdrop-blur-lg" onClick={() => setShowInviteQr(false)}>
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-5 text-center text-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
            <button type="button" onClick={() => setShowInviteQr(false)} aria-label={t('btn.close')} className="absolute right-3 top-3 rounded-full bg-slate-900 p-2 text-white active:scale-90"><X className="h-5 w-5" /></button>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(gameUrl)}`} alt={t('qr.game')} className="mx-auto mt-7 aspect-square w-full rounded-xl" />
            <p className="mt-4 text-xl font-black">{t('qr.game')}</p>
            <p className="mt-1 text-sm text-slate-500">{new URL(gameUrl).host}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameOffScreen;
