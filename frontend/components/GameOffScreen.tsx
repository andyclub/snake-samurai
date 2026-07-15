import React from 'react';
import { audio } from '../audio';

interface Props {
  t: (key: string) => string;
}

const GameOffScreen: React.FC<Props> = ({ t }) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="text-center space-y-8 p-8 bg-black/30 rounded-2xl backdrop-blur-sm border border-white/10 max-w-2xl w-full mx-4">
        <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
          {t('app.title')}
        </h1>
        
        <div className="py-4">
          <p className="text-2xl text-red-400 font-semibold animate-pulse">
            {t('status.off')}
          </p>
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
            <span className="text-sm font-bold text-emerald-400">{t('qr.line')}</span>
            <span className="text-xs text-slate-400">{t('contact.line')}</span>
          </div>

          {/* Game URL QR Code */}
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-2 rounded-xl shadow-lg">
              <img 
                src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://g.kazeabc.com" 
                alt="Game QR" 
                className="w-32 h-32"
              />
            </div>
            <span className="text-sm font-bold text-blue-400">{t('qr.game')}</span>
            <span className="text-xs text-slate-400">g.kazeabc.com</span>
          </div>
        </div>

        <button 
          onClick={() => audio.playPop()}
          className="mt-8 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold transition-all transform hover:scale-105 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
        >
          {t('btn.request')}
        </button>
      </div>
    </div>
  );
};

export default GameOffScreen;
