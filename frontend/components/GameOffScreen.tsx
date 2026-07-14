import React from 'react';

interface Props {
  t: (key: string) => string;
}

const GameOffScreen: React.FC<Props> = ({ t }) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="text-center space-y-8 p-8 bg-black/30 rounded-2xl backdrop-blur-sm border border-white/10">
        <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
          {t('app.title')}
        </h1>
        
        <div className="py-8">
          <p className="text-2xl text-red-400 font-semibold animate-pulse">
            {t('status.off')}
          </p>
        </div>

        <div className="space-y-4 text-slate-300">
          <p>{t('contact.line')}</p>
          <p>{t('contact.email')}</p>
        </div>

        <button className="mt-8 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold transition-all transform hover:scale-105 shadow-[0_0_15px_rgba(59,130,246,0.5)]">
          {t('btn.request')}
        </button>
      </div>
    </div>
  );
};

export default GameOffScreen;
