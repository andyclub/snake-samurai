import React, { useEffect, useRef, useState } from 'react';
import { ArenaBounds, CandidateSentence, CandidateWord, FoodState, Player, SnakeState, Theme } from '../types';
import { calculateCameraZoom } from '../game/snakeMovement';
import { renderGame } from '../game/snakeRenderer';
import { searchCandidates } from '../language/trieEngine';
import { analyzeSentenceBuilding } from '../language/sentenceEngine';
import { audio } from '../audio';
import { Trophy, Flame, RotateCcw, Sparkles } from 'lucide-react';

interface Props {
  player: Player;
  snakes: Record<string, SnakeState>;
  foods: Record<string, FoodState>;
  bounds: ArenaBounds;
  theme: Theme;
  mode: string;
  timeRemainingSeconds: number;
  onPointerTarget: (x: number, y: number) => void;
  onSettleWord: (candidate: CandidateWord) => void;
  onSettleSentence: (candidate: CandidateSentence) => void;
  onSpillTail: () => void;
  t: (key: string) => string;
}

export const GameBoard: React.FC<Props> = ({
  player,
  snakes,
  foods,
  bounds,
  theme,
  mode,
  timeRemainingSeconds,
  onPointerTarget,
  onSettleWord,
  onSettleSentence,
  onSpillTail,
  t
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [clickEffect, setClickEffect] = useState<{ x: number; y: number; time: number } | null>(null);

  const mySnake = snakes[`snake-${player.id}`] || Object.values(snakes).find(s => s.playerId === player.id);

  // Pointer interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !mySnake) return;

    const rect = canvas.getBoundingClientRect();
    const touchX = e.clientX - rect.left;
    const touchY = e.clientY - rect.top;

    const cameraZoom = calculateCameraZoom(mySnake.totalLength);
    const cameraX = mySnake.head.x;
    const cameraY = mySnake.head.y;

    // Convert screen coordinates to world coordinates
    const worldX = (touchX - canvas.width / 2) / cameraZoom + cameraX;
    const worldY = (touchY - canvas.height / 2) / cameraZoom + cameraY;

    // Check if tapping player's own snake tail tip to spill foods
    const tailPt = mySnake.bodyPath[mySnake.bodyPath.length - 1];
    if (tailPt && Math.hypot(worldX - tailPt.x, worldY - tailPt.y) < 40 && mySnake.heldFoods.length > 0) {
      onSpillTail();
      setClickEffect({ x: worldX, y: worldY, time: Date.now() });
      audio.playTailSpill();
      return;
    }

    onPointerTarget(worldX, worldY);
    setClickEffect({ x: worldX, y: worldY, time: Date.now() });
    audio.playPickup();
  };

  // Render loop
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = window.innerWidth;
          const height = window.innerHeight;
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }

          const zoom = mySnake ? calculateCameraZoom(mySnake.totalLength) : 0.8;
          renderGame(ctx, width, height, bounds, snakes, foods, mySnake ? mySnake.id : null, zoom, clickEffect);
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [snakes, foods, bounds, mySnake, clickEffect]);

  // Evaluate candidate words / sentences
  const heldFoods = mySnake?.heldFoods || [];
  const wordSearch = searchCandidates(heldFoods, theme);
  const sentenceAnalysis = analyzeSentenceBuilding(heldFoods, theme);

  // Leaderboard sorting
  const leaderboard = Object.values(snakes)
    .filter(s => s.connected)
    .sort((a, b) => b.totalLength - a.totalLength);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        className="w-full h-full cursor-crosshair touch-none"
      />

      {/* Top HUD: Theme, Timer, Stats */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
        {/* Theme & Mode Banner */}
        <div className="bg-slate-900/90 border border-cyan-500/30 backdrop-blur-md rounded-2xl px-4 py-2 shadow-xl flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">
              {mode === 'disaster' ? '防災専場' : mode === 'random' ? '今回のテーマ' : '初心者フリー場'}
            </div>
            <div className="text-lg font-black text-white capitalize">
              {theme === 'disaster' ? '防災・安全' : theme}
            </div>
          </div>
        </div>

        {/* 120s Countdown Timer */}
        <div className={`bg-slate-900/90 border backdrop-blur-md rounded-2xl px-6 py-2 shadow-xl text-center ${
          timeRemainingSeconds <= 10 ? 'border-red-500 text-red-400 animate-bounce' : timeRemainingSeconds <= 30 ? 'border-amber-500 text-amber-300' : 'border-emerald-500/40 text-emerald-400'
        }`}>
          <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Time</div>
          <div className="text-2xl font-black font-mono">
            {Math.floor(timeRemainingSeconds / 60)}:{(timeRemainingSeconds % 60).toString().padStart(2, '0')}
          </div>
        </div>

        {/* Live Leaderboard Mini */}
        <div className="bg-slate-900/90 border border-white/10 backdrop-blur-md rounded-2xl p-3 shadow-xl max-w-xs w-48">
          <div className="flex items-center gap-2 text-xs font-black text-amber-400 mb-1">
            <Trophy className="w-4 h-4" /> 排名榜
          </div>
          <div className="space-y-1 text-xs">
            {leaderboard.slice(0, 3).map((s, idx) => (
              <div key={s.id} className="flex justify-between items-center text-slate-300 font-medium">
                <span className="truncate max-w-[90px]">{idx + 1}. {s.nickname}</span>
                <span className="font-mono font-bold text-amber-300">{s.totalLength}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Floating Candidates & Settle Bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3 max-w-lg w-full px-4">
        {/* Candidate Sentence Bubbles (GOLD ONLY) */}
        {sentenceAnalysis.isSentenceReady && sentenceAnalysis.candidates.map(candidate => (
          <button
            key={candidate.id}
            onClick={() => {
              audio.playSentenceCompleted();
              onSettleSentence(candidate);
            }}
            className="w-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 border-2 border-yellow-200 text-slate-950 font-black py-3 px-6 rounded-2xl shadow-2xl shadow-yellow-500/50 hover:scale-105 active:scale-95 transition-transform flex items-center justify-between"
          >
            <span className="text-lg tracking-wide">{candidate.text}</span>
            <span className="text-xs bg-black text-yellow-300 font-extrabold px-3 py-1 rounded-full">
              金旗句 (+{candidate.totalLengthBonus})
            </span>
          </button>
        ))}

        {/* Sentence Building Mode Status */}
        {sentenceAnalysis.isSentenceBuilding && !sentenceAnalysis.isSentenceReady && (
          <div className="bg-amber-900/80 border border-amber-400/50 text-amber-200 text-xs font-bold py-2 px-5 rounded-full shadow-lg backdrop-blur-md animate-pulse flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            組句中…继续捡字组成完整句子！
          </div>
        )}

        {/* Candidate Word Bubbles (Normal Food Colors, NEVER GOLD) */}
        {!sentenceAnalysis.isSentenceBuilding && wordSearch.status === 'WORD_READY' && wordSearch.candidates.map(candidate => (
          <button
            key={candidate.id}
            onClick={() => {
              audio.playWordCompleted();
              onSettleWord(candidate);
            }}
            className="w-full bg-slate-900/90 border-2 border-cyan-400/80 hover:border-cyan-300 text-cyan-200 font-extrabold py-3 px-6 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-between backdrop-blur-md"
          >
            <div>
              <span className="text-xl text-white font-black">{candidate.canonical}</span>
              <span className="ml-2 text-xs text-cyan-400">({candidate.reading})</span>
            </div>
            <span className="text-xs bg-cyan-950 text-cyan-300 font-bold px-3 py-1 rounded-full border border-cyan-700">
              +{candidate.readingLength} 身长
            </span>
          </button>
        ))}

        {/* Abandon / Spill Tail Button */}
        {heldFoods.length > 0 && (
          <button
            onClick={() => {
              audio.playTailSpill();
              onSpillTail();
            }}
            className="bg-red-950/80 border border-red-500/40 text-red-300 hover:bg-red-900 font-bold text-xs py-2 px-5 rounded-full shadow-lg backdrop-blur-md transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> 弃牌/甩字 ({heldFoods.length})
          </button>
        )}
      </div>
    </div>
  );
};

export default GameBoard;
