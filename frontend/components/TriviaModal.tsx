import React, { useState, useEffect } from 'react';
import { Encounter, Player, Slime } from '../types';
import { audio } from '../audio';
import FullscreenCountdown from './FullscreenCountdown';
import SlimeAvatar from './SlimeAvatar';

interface Props {
  t: (key: string) => string;
  encounter: Encounter;
  player: Player;
  slimes: Slime[];
  onVote: (optionIndex: number) => void;
}

const TriviaModal: React.FC<Props> = ({ t, encounter, player, slimes, onVote }) => {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.ceil((encounter.startTime + 20_000 - Date.now()) / 1000)));
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isArmed, setIsArmed] = useState(Date.now() >= encounter.startTime + 1000);
  const [resultElapsed, setResultElapsed] = useState(0);

  useEffect(() => {
    const wait = Math.max(0, encounter.startTime + 1000 - Date.now());
    const timer = setTimeout(() => setIsArmed(true), wait);
    return () => clearTimeout(timer);
  }, [encounter.startTime]);

  useEffect(() => {
    if (!encounter.resolved) audio.speakQuestion(encounter.question.text);
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((encounter.startTime + 20_000 - Date.now()) / 1000)));
    const timer = setInterval(tick, 200);
    tick();
    return () => clearInterval(timer);
  }, [encounter.id]);

  useEffect(() => {
    if (!encounter.resolved || !encounter.result?.resolvedAt) {
      setResultElapsed(0);
      return;
    }
    const tick = () => setResultElapsed(Date.now() - encounter.result!.resolvedAt!);
    tick();
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [encounter.resolved, encounter.result?.resolvedAt]);

  const handleSelect = (index: number) => {
    if (!isArmed || encounter.resolved || selectedOption !== null) return;
    audio.playPop();
    setSelectedOption(index);
    onVote(index);
  };

  const q = encounter.question;
  const teams = [
    { members: encounter.participants1 || slimes.find(s=>s.id===encounter.slime1Id)?.members || [], votes: encounter.votes1, side: 'A', panelClass: 'bg-blue-500/10 border-blue-400/30' },
    { members: encounter.participants2 || slimes.find(s=>s.id===encounter.slime2Id)?.members || [], votes: encounter.votes2, side: 'B', panelClass: 'bg-rose-500/10 border-rose-400/30' },
  ];
  const winnerSlime = encounter.result ? slimes.find(slime => slime.id === encounter.result?.winnerSlimeId) : undefined;
  const loserFragments = encounter.result ? slimes.filter(slime =>
    slime.id === encounter.result?.loserSlimeId || slime.id.startsWith(`${encounter.result?.loserSlimeId}-split-`)
  ) : [];
  const loserSlime = loserFragments[0];
  const playerWon = encounter.result?.winnerSlimeId === encounter.slime1Id
    ? Boolean(encounter.participants1?.some(member => member.id === player.id))
    : Boolean(encounter.participants2?.some(member => member.id === player.id));
  const resultTone = encounter.resolved ? (playerWon ? 'bg-red-950 border-red-400 shadow-[0_0_45px_rgba(239,68,68,.55)]' : 'bg-blue-950 border-blue-400 shadow-[0_0_45px_rgba(59,130,246,.55)]') : 'bg-slate-800 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]';
  const finalExplanation = encounter.resolved && resultElapsed >= 2500;
  const majorityChoice = (votes: Record<string, number>) => {
    const counts = [0, 0, 0, 0];
    Object.values(votes).forEach(vote => { if (vote >= 0 && vote < 4) counts[vote] += 1; });
    const max = Math.max(...counts);
    return max === 0 ? -1 : counts.indexOf(max);
  };

  if (finalExplanation && encounter.result) return (
    <div className={`fixed inset-0 z-[115] flex flex-col items-center justify-center px-3 py-5 ${playerWon ? 'bg-red-950' : 'bg-blue-950'} battle-answer-explanation`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.16),transparent_65%)]" />
      <div className="relative w-full max-w-4xl text-center">
        <div className="text-sm sm:text-lg font-black tracking-[.25em] text-white/75">🔎 {t('battle.explanation')}</div>
        <div className={`mt-2 text-4xl sm:text-6xl font-black ${playerWon ? 'text-red-200' : 'text-blue-200'}`}>{playerWon ? t('battle.youWin') : t('battle.youLose')}</div>
        <div className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-500/20 px-5 py-2 text-lg sm:text-2xl font-black text-emerald-100">✓ {['A','B','C','D'][q.correctIndex]}. {q.options[q.correctIndex]}</div>
        {encounter.result.leadMs !== undefined && <div className="mt-2 text-base sm:text-xl font-black text-cyan-100">⏱ {encounter.result.winnerName} {t('battle.lead')} {encounter.result.leadMs} ms</div>}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-6 text-left">
          {teams.map(team => {
            const teamSlimeId = team.side === 'A' ? encounter.slime1Id : encounter.slime2Id;
            const won = encounter.result!.winnerSlimeId === teamSlimeId;
            const majority = majorityChoice(team.votes);
            return <section key={team.side} className={`rounded-2xl sm:rounded-3xl border-4 p-3 sm:p-5 ${won ? 'border-red-300 bg-red-600/25' : 'border-blue-300 bg-blue-600/25'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-white/20 pb-2 sm:pb-3">
                <b className="text-xl sm:text-3xl text-white">{t('trivia.team')} {team.side}</b>
                <span className={`text-sm sm:text-xl font-black ${won ? 'text-red-200' : 'text-blue-200'}`}>{won ? `🏆 ${t('battle.wins')}` : `✕ ${t('battle.youLose')}`}</span>
              </div>
              <div className="mt-2 sm:mt-3 space-y-2">
                {team.members.map(member => {
                  const vote = team.votes[member.id];
                  const correct = vote === q.correctIndex;
                  return <div key={member.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1 rounded-xl border px-3 py-2 sm:px-4 sm:py-3 ${vote === undefined ? 'border-slate-400 bg-slate-700/70' : correct ? 'border-emerald-300 bg-emerald-500/25' : 'border-red-300 bg-red-500/25'}`}>
                    <span className="truncate text-base sm:text-2xl font-black text-white">{member.name}</span>
                    <span className="shrink-0 text-sm sm:text-xl font-black text-white">{vote === undefined ? `— ${t('trivia.noVote')}` : `${correct ? '✅' : '❌'} ${['A','B','C','D'][vote]} · ${correct ? t('battle.correct') : t('battle.wrong')}`}</span>
                  </div>;
                })}
              </div>
              <div className={`mt-3 rounded-xl px-3 py-2 text-center text-sm sm:text-lg font-black ${majority === q.correctIndex ? 'bg-emerald-400 text-emerald-950' : 'bg-red-400 text-red-950'}`}>
                {t('battle.teamAnswer')}: {majority < 0 ? t('trivia.noVote') : ['A','B','C','D'][majority]} {majority === q.correctIndex ? '✓' : '✕'}
              </div>
            </section>;
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <FullscreenCountdown value={timeLeft} label={t('countdown.answerDeadline')} active={!encounter.resolved} />
      <div className={`${resultTone} border-2 rounded-2xl p-8 max-w-2xl w-full mx-4 transform transition-all scale-100 animate-in zoom-in duration-200`}>
        
        <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
          <h2 className="text-2xl font-bold text-red-400 flex items-center gap-2">
            ⚔️ {t('trivia.vs')}
          </h2>
          <div className={`text-3xl font-mono font-bold ${encounter.resolved ? 'text-yellow-300' : timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
            {encounter.resolved ? t('battle.result') : `${timeLeft}s`}
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-blue-600 text-xs px-2 py-1 rounded uppercase font-bold tracking-wider">
              {q.type}
            </span>
            {q.level && (
              <span className="bg-purple-600 text-xs px-2 py-1 rounded font-bold">
                {q.level}
              </span>
            )}
          </div>
          <div className="flex items-start gap-3">
            <p className="text-2xl text-white leading-relaxed flex-1">
              {q.text}
            </p>
            <button
              type="button"
              onClick={() => audio.speakQuestion(q.text)}
              className="shrink-0 w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-300/50 text-2xl hover:bg-cyan-400/30 active:scale-90 transition-all"
              title="Local TTS"
              aria-label="Local TTS"
            >🔊</button>
          </div>
          {encounter.resolved && encounter.result && winnerSlime && loserSlime && (
            <div key={`fx-${encounter.id}`} className={`trivia-battle-fx ${encounter.result.outcome}`}>
              <div className="trivia-fx-winner">
                <SlimeAvatar color={winnerSlime.members[0]?.color || winnerSlime.color} colors={winnerSlime.members.map(member => member.color)} className="w-24 h-24" />
                <b>🏆 {encounter.result.winnerName}</b>
              </div>
              <div className="trivia-fx-impact">{encounter.result.outcome === 'split' ? '💥' : '🌀'}</div>
              {encounter.result.outcome === 'devour' ? (
                <div className="trivia-fx-devoured">
                  <SlimeAvatar color={loserSlime.members[0]?.color || loserSlime.color} colors={loserSlime.members.map(member => member.color)} className="w-20 h-20" />
                </div>
              ) : (
                <div className="trivia-fx-split">
                  {loserFragments.slice(0, 2).map((fragment, index) => (
                    <SlimeAvatar key={fragment.id} color={fragment.members[0]?.color || fragment.color} colors={fragment.members.map(member => member.color)} className={`w-16 h-16 split-piece-${index + 1}`} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {q.options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              disabled={!isArmed || encounter.resolved || selectedOption !== null}
              className={`
                p-4 rounded-xl text-lg font-medium transition-all duration-200 text-left
                ${encounter.resolved && idx === q.correctIndex
                  ? 'bg-emerald-500 text-white ring-4 ring-emerald-200 shadow-[0_0_25px_rgba(52,211,153,.65)]'
                  : encounter.resolved && selectedOption === idx
                    ? 'bg-red-600 text-white ring-2 ring-red-200'
                    : selectedOption === idx
                  ? 'bg-blue-600 text-white ring-2 ring-white shadow-lg' 
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600 hover:scale-[1.02]'}
                ${(!isArmed || (selectedOption !== null && selectedOption !== idx)) && !encounter.resolved ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <span className="inline-block w-8 h-8 bg-black/20 rounded-full text-center leading-8 mr-3">
                {['A', 'B', 'C', 'D'][idx]}
              </span>
              {opt}
            </button>
          ))}
        </div>

        {!isArmed && !encounter.resolved && <div className="mt-4 text-center text-amber-300 font-black animate-pulse">⚡ {t('trivia.ready')}</div>}

        {encounter.resolved && encounter.result && <div className={`mt-6 rounded-2xl border-2 p-5 text-center ${playerWon ? 'border-red-300 bg-red-500/20' : 'border-blue-300 bg-blue-500/20'}`}><p className="text-sm text-white font-black tracking-widest">{t('battle.correct')}</p><p className="text-2xl text-white font-black mt-2">{['A','B','C','D'][q.correctIndex]}. {q.options[q.correctIndex]}</p><p className="mt-3 text-2xl text-white font-black">{playerWon ? t('battle.youWin') : t('battle.youLose')}</p>{encounter.result.leadMs !== undefined && <p className="mt-2 text-cyan-100 font-black">⏱ {t('battle.lead')} {encounter.result.leadMs} ms</p>}</div>}

        <div className="grid grid-cols-2 gap-3 mt-6">
          {teams.map(team => <div key={team.side} className={`rounded-xl border p-3 ${team.panelClass}`}><div className="font-black mb-2">{t('trivia.team')} {team.side}</div><div className="space-y-1.5">{team.members.map(member => {
            const vote = team.votes[member.id];
            const isCorrect = vote === encounter.question.correctIndex;
            const status = !encounter.resolved
              ? vote === undefined ? `… ${t('trivia.thinking')}` : ['A','B','C','D'][vote]
              : vote === undefined ? `— ${t('trivia.noVote')}` : isCorrect ? `✅ ${['A','B','C','D'][vote]} · ${t('battle.correct')}` : `❌ ${['A','B','C','D'][vote]} · ${t('battle.wrong')}`;
            return <div key={member.id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs ${encounter.resolved ? vote === undefined ? 'bg-slate-700/60 text-slate-400' : isCorrect ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30' : 'bg-red-500/20 text-red-200 ring-1 ring-red-400/30' : 'bg-black/15'}`}><span className="truncate font-bold">{member.name}</span><b className="shrink-0">{status}</b></div>;
          })}</div></div>)}
        </div>

        {selectedOption !== null && !encounter.resolved && (
          <div className="mt-6 text-center text-slate-400 animate-pulse">
            {t('trivia.waiting')}
          </div>
        )}
      </div>
    </div>
  );
};

export default TriviaModal;
