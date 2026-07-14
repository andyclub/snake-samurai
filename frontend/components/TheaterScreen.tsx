import React from 'react';
import { Slime, Player } from '../types';
import { Trophy, Target, Users, RefreshCw } from 'lucide-react';

interface Props {
  t: (key: string) => string;
  slimes: Slime[];
  player: Player;
  onRestart: () => void;
}

const TheaterScreen: React.FC<Props> = ({ t, slimes, player, onRestart }) => {
  // Find the winner (largest alive slime, or last one standing)
  const aliveSlimes = slimes.filter(s => !s.isDead);
  const winner = aliveSlimes.sort((a, b) => b.size - a.size)[0];

  const isWinner = winner?.members.some(m => m.id === player.id);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 overflow-y-auto py-12">
      <div className="max-w-3xl w-full px-6 space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
            {t('theater.title')}
          </h1>
          <p className="text-xl text-slate-400">
            {isWinner ? '🎉 恭喜获胜！' : '再接再厉！'}
          </p>
        </div>

        {/* Winner Card */}
        {winner && (
          <div className="bg-gradient-to-br from-yellow-900/40 to-yellow-600/20 border border-yellow-500/30 rounded-3xl p-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent"></div>
            <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-2xl text-yellow-200 mb-2">{t('theater.winner')}</h2>
            <div className="flex items-center justify-center gap-4">
              <div 
                className="w-12 h-12 rounded-full border-2 border-white shadow-lg"
                style={{ backgroundColor: winner.color }}
              />
              <span className="text-3xl font-bold text-white">
                {winner.members[0].name} 
                {winner.members.length > 1 && <span className="text-xl text-yellow-400 ml-2">+{winner.members.length - 1}</span>}
              </span>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-black/40 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-4 text-emerald-400">
              <Target className="w-6 h-6" />
              <h3 className="text-xl font-bold">{t('theater.accuracy')}</h3>
            </div>
            <div className="text-4xl font-mono text-white mb-2">75%</div>
            <p className="text-sm text-slate-400">擅长: 词汇 (N3)</p>
            <p className="text-sm text-slate-400">薄弱: 敬语</p>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-4 text-blue-400">
              <Users className="w-6 h-6" />
              <h3 className="text-xl font-bold">{t('theater.contribution')}</h3>
            </div>
            <div className="text-4xl font-mono text-white mb-2">A+</div>
            <p className="text-sm text-slate-400">关键投票: 3次</p>
            <p className="text-sm text-slate-400">融合次数: 2次</p>
          </div>
        </div>

        {/* Action */}
        <div className="text-center pt-8">
          <button 
            onClick={onRestart}
            className="inline-flex items-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-full font-bold transition-all border border-slate-600 hover:border-slate-400"
          >
            <RefreshCw className="w-5 h-5" />
            {t('theater.next')}
          </button>
        </div>

      </div>
    </div>
  );
};

export default TheaterScreen;
