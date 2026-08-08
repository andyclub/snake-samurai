import React from 'react';
import { ArenaState, Player } from '../types';
import { RotateCcw } from 'lucide-react';

interface Props {
  arenaState: ArenaState;
  player: Player;
  onRestart: () => void;
  t: (key: string) => string;
}

export const TheaterScreen: React.FC<Props> = ({ arenaState, player, onRestart, t }) => {
  const leaderboard = Object.values(arenaState.snakes)
    .sort((a, b) => b.earnedLength - a.earnedLength);

  const winner = leaderboard[0];

  return (
    <div className="fixed inset-0 z-50 bg-[radial-gradient(circle_at_center,#3b0764_0%,#0f172a_55%,#020617_100%)] text-white flex flex-col items-center justify-center p-6 overflow-y-auto">
      <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'conic-gradient(from 0deg at 50% 50%, transparent, #fbbf24, transparent 20%)', animation: 'spin 8s linear infinite' }} />
      <div className="relative max-w-2xl w-full bg-black/45 backdrop-blur-sm border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-white">本局成绩</h1>
          <p className="text-slate-400 text-sm">仅计算已拼成的单词、句子及句子额外奖励。</p>
        </div>

        {/* Leaderboard & Achievement Review */}
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
          {leaderboard.map((snake, index) => {
            const words = snake.completionHistory.filter(r => r.type === 'word');
            const sentences = snake.completionHistory.filter(r => r.type === 'sentence');

            return (
              <div
                key={snake.id}
                className={`p-5 rounded-2xl border transition-all ${
                  index === 0
                    ? 'bg-gradient-to-r from-amber-950/60 to-yellow-950/40 border-yellow-500/50 shadow-lg shadow-yellow-500/10'
                    : 'bg-slate-800/60 border-white/5'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-sm ${
                      index === 0 ? 'bg-yellow-400 text-slate-950' : 'bg-slate-700 text-slate-300'
                    }`}>
                      {index + 1}
                    </span>
                    <span className="font-extrabold text-lg text-white">{snake.nickname}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black font-mono text-amber-400">
                      {snake.earnedLength} <span className="text-xs font-normal text-slate-400">分</span>
                    </div>
                  </div>
                </div>

                {sentences.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">完成句子 ({sentences.length})</div>
                    <div className="flex flex-wrap gap-2">
                      {sentences.map(s => (
                        <span
                          key={s.id}
                          className="bg-amber-400/20 border border-yellow-400/60 text-yellow-200 text-xs font-black px-3 py-1 rounded-xl shadow-sm"
                        >
                          {s.canonical} (+{s.totalLengthAdded})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {words.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">完成单词 ({words.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {words.map(w => (
                        <span
                          key={w.id}
                          className="bg-slate-700/80 border border-slate-600 text-slate-200 text-xs font-bold px-2.5 py-0.5 rounded-lg"
                        >
                          {w.canonical}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Control Button */}
        <button
          onClick={onRestart}
          className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 active:scale-98 font-black text-slate-950 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-5 h-5" /> 返回大厅
        </button>
      </div>
    </div>
  );
};

export default TheaterScreen;
