import React, { useState } from 'react';
import ArenaCards from './ArenaCards';
import HomeLink from './HomeLink';
import { Play, QrCode, X } from 'lucide-react';
import { audio } from '../audio';

interface Props {
  t: (key: string) => string;
  arenaName: string;
  gameUrl?: string;
}

const GameOffScreen: React.FC<Props> = ({ t, arenaName, gameUrl = 'https://g.kazeabc.com' }) => {
  const [showInviteQr, setShowInviteQr] = useState(false);

  return (
    <div className="w-full max-w-full h-full flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="text-center space-y-8 p-8 bg-black/30 rounded-2xl backdrop-blur-sm border border-white/10 max-w-2xl w-[calc(100%_-_2rem)] max-h-[calc(100dvh_-_2rem)] overflow-y-auto overflow-x-hidden overscroll-contain">
        <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
          {t('app.title')}
        </h1>
        
        <div className="py-4">
          <p className="text-2xl text-red-400 font-semibold animate-pulse">
            {t('status.off')}
          </p>
        </div>
        <div className="flex justify-center"><ArenaCards t={t} arenaName={arenaName} /></div>

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
          {/* LINE QR Code */}
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-2 rounded-xl shadow-lg">
              <img 
                src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://line.me/ti/p/n6lUPFD-0p" 
                alt="LINE QR" 
                className="w-32 h-32"
              />
            </div>
            <span className="text-sm font-bold text-emerald-400">{t('line.requestStart')}</span>
            <span className="text-xs text-slate-400">{t('contact.line')}</span>
          </div>

          <button
            type="button"
            onClick={() => { audio.playPop(); setShowInviteQr(true); }}
            className="inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-blue-300/25 bg-blue-400/10 px-6 py-4 font-black text-blue-100 shadow-[0_12px_35px_rgba(59,130,246,.12)] transition hover:border-blue-200/50 hover:bg-blue-400/20 active:scale-95"
          >
            <QrCode className="h-6 w-6" />
            {t('btn.inviteGame')}
          </button>
        </div>

        <div className="flex justify-center border-t border-white/10 pt-6">
          <HomeLink />
        </div>

      </div>
      {showInviteQr && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-5 backdrop-blur-lg" onClick={() => setShowInviteQr(false)}>
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-5 text-center text-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
            <button type="button" onClick={() => setShowInviteQr(false)} aria-label={t('btn.close')} className="absolute right-3 top-3 rounded-full bg-slate-900 p-2 text-white active:scale-90"><X className="h-5 w-5" /></button>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(gameUrl)}`} alt={t('qr.game')} className="mx-auto mt-7 aspect-square w-full rounded-xl" />
            <p className="mt-4 text-xl font-black">{t('qr.game')}</p>
            <p className="mt-1 text-sm text-slate-500">g.kazeabc.com</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameOffScreen;
