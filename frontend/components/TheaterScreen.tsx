import React, { useState } from 'react';
import { Slime, Player } from '../types';
import { Trophy, Users, RefreshCw } from 'lucide-react';
import { audio } from '../audio';
import SlimeAvatar from './SlimeAvatar';
import { useEffect } from 'react';

interface Props {
  t: (key: string) => string;
  slimes: Slime[];
  player: Player;
  onRestart: () => Promise<{ ok: boolean; message: string }>;
}

const TheaterScreen: React.FC<Props> = ({ t, slimes, player, onRestart }) => {
  const [restarting, setRestarting] = useState(false);
  const [restartMessage, setRestartMessage] = useState('');
  // Find the winner (largest alive slime, or last one standing)
  const aliveSlimes = slimes.filter(s => !s.isDead);
  const winner = aliveSlimes.sort((a, b) => b.size - a.size)[0];
  const winnerIds = new Set(winner?.members.map(member => member.id) || []);
  const contributionScore = (member: Player) => {
    const stats = member.battleStats;
    if (!stats) return 0;
    return stats.battles * 5 + stats.votes * 2 + stats.correctVotes * 30 + stats.wins * 20 + stats.devours * 15;
  };
  const playersById = new Map<string, Player>();
  slimes.flatMap(slime => slime.members).forEach(member => {
    const previous = playersById.get(member.id);
    if (!previous || contributionScore(member) >= contributionScore(previous)) playersById.set(member.id, member);
  });
  const contributionRanking = [...playersById.values()].sort((a, b) =>
    contributionScore(b) - contributionScore(a) || a.name.localeCompare(b.name, 'ja')
  );

  const isWinner = winner?.members.some(m => m.id === player.id);

  useEffect(() => {
    audio.playOutcome(Boolean(isWinner));
    const resultTimer = window.setTimeout(() => audio.setBGM('RESULT'), 1400);
    const replay = () => {
      audio.playOutcome(Boolean(isWinner));
      window.setTimeout(() => audio.setBGM('RESULT'), 1400);
    };
    window.addEventListener('kazeabc-replay', replay);
    return () => { window.clearTimeout(resultTimer); window.removeEventListener('kazeabc-replay', replay); };
  }, [isWinner]);

  return (
    <div className="fixed inset-0 w-full max-w-full h-full flex flex-col items-center justify-start sm:justify-center bg-[radial-gradient(circle_at_center,#3b0764_0%,#0f172a_55%,#020617_100%)] overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y py-12 relative">
      <div className="absolute inset-0 pointer-events-none opacity-30" style={{backgroundImage:'conic-gradient(from 0deg at 50% 50%, transparent, #fbbf24, transparent 20%)',animation:'spin 8s linear infinite'}} />
      <div className="max-w-3xl min-w-0 w-full px-6 space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
            {t('theater.title')}
          </h1>
          <p className="text-xl text-slate-400">
            {isWinner ? `🎉 ${t('battle.youWin')}` : t('battle.youLose')}
          </p>
        </div>

        {/* Winner Card */}
        {winner && (
          <div className="bg-gradient-to-br from-yellow-900/40 to-yellow-600/20 border border-yellow-500/30 rounded-3xl p-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent"></div>
            <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
            <SlimeAvatar color={winner.members[0]?.color || winner.color} colors={winner.members.map(member => member.color)} className="w-40 h-40 mx-auto -mt-6" />
            <h2 className="text-2xl text-yellow-200 mb-2">{t('theater.winner')}</h2>
            <div className="flex items-center justify-center gap-4">
              <span className="text-3xl font-bold text-white">
                {winner.members[0].name} 
                {winner.members.length > 1 && <span className="text-xl text-yellow-400 ml-2">+{winner.members.length - 1}</span>}
              </span>
            </div>
          </div>
        )}

        {/* Contribution ranking across every participant, including players
            who were split or devoured earlier in the round. */}
        <div className="bg-black/45 border border-white/10 rounded-3xl p-5 sm:p-7 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 mb-5 text-blue-300">
            <div className="flex items-center gap-3">
              <Users className="w-7 h-7" />
              <h3 className="text-2xl font-black">{t('theater.contribution')}</h3>
            </div>
            <span className="text-sm font-bold text-slate-400">{t('theater.players')}: {contributionRanking.length}</span>
          </div>
          <div className="space-y-2">
            {contributionRanking.map((member, index) => {
              const stats = member.battleStats || { battles: 0, votes: 0, correctVotes: 0, wins: 0, losses: 0, devours: 0, splits: 0 };
              const accuracy = stats.votes ? Math.round(stats.correctVotes / stats.votes * 100) : 0;
              const champion = winnerIds.has(member.id);
              return <div key={member.id} className={`grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_auto_auto] items-center gap-3 rounded-2xl px-3 py-3 border ${champion ? 'bg-yellow-400/15 border-yellow-300/50' : 'bg-slate-900/65 border-white/5'}`}>
                <span className={`text-center text-xl font-black ${index < 3 ? 'text-yellow-300' : 'text-slate-500'}`}>{index + 1}</span>
                <div className="min-w-0">
                  <div className="font-black text-white truncate"><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{backgroundColor: member.color}} />{member.name} {champion && <span title={t('theater.champion')}>👑</span>}</div>
                  <div className="text-xs text-slate-400 mt-1">⚔ {t('theater.battles')} {stats.battles} · ✓ {t('theater.correctVotes')} {stats.correctVotes}/{stats.votes} ({accuracy}%)</div>
                </div>
                <div className="hidden sm:block text-right text-xs text-slate-400">🏆 {stats.wins}　🌀 {stats.devours}</div>
                <div className="text-right"><b className="text-xl text-cyan-300 font-mono">{contributionScore(member)}</b><small className="block text-[10px] uppercase tracking-widest text-slate-500">{t('theater.points')}</small></div>
              </div>;
            })}
          </div>
        </div>

        {/* Action & QR Code */}
        <div className="text-center pt-8 flex flex-col items-center gap-8">
          <button 
            disabled={restarting}
            onClick={async () => {
              audio.playPop();
              setRestarting(true);
              setRestartMessage(t('start.starting'));
              const result = await onRestart();
              setRestartMessage(`${result.ok ? '✅' : '⚠️'} ${result.message}`);
              setRestarting(false);
            }}
            className="inline-flex items-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-full font-bold transition-all border border-slate-600 hover:border-slate-400"
          >
            <RefreshCw className={`w-5 h-5 ${restarting ? 'animate-spin' : ''}`} />
            {restarting ? t('start.starting') : t('theater.next')}
          </button>
          {restartMessage && <p className="text-sm font-bold text-white/80" role="status">{restartMessage}</p>}

          <div className="flex flex-col items-center gap-2 bg-black/30 p-4 rounded-2xl border border-white/5">
            <div className="bg-white p-1.5 rounded-lg">
              <img 
                src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https://g.kazeabc.com" 
                alt="Game QR" 
                className="w-24 h-24"
              />
            </div>
            <span className="text-sm text-slate-400 font-medium">{t('qr.game')}</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TheaterScreen;
