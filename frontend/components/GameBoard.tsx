import React, { useEffect, useRef, useState } from 'react';
import { ArenaBounds, CandidateSentence, CandidateWord, FoodState, Language, Player, SnakeState, Theme } from '../types';
import { calculateCameraZoom } from '../game/snakeMovement';
import { renderGame } from '../game/snakeRenderer';
import { searchCandidates } from '../language/trieEngine';
import { analyzeSentenceBuilding } from '../language/sentenceEngine';
import { audio } from '../audio';
import { saveLanguagePreference } from '../i18n';
import { Trophy, Sparkles, Globe, HelpCircle, QrCode, X } from 'lucide-react';

interface Props {
  player: Player;
  snakes: Record<string, SnakeState>;
  foods: Record<string, FoodState>;
  bounds: ArenaBounds;
  theme: Theme;
  mode: string;
  timeRemainingSeconds: number;
  lang: Language;
  onSelectLanguage: (lang: Language) => void;
  onPointerTarget: (x: number, y: number) => void;
  onSettleWord: (candidate: CandidateWord) => void;
  onSettleSentence: (candidate: CandidateSentence) => void;
  onSpillTail: () => void;
  t: (key: string) => string;
}

const INVITE_URL = 'https://h.kazeabc.com';
const QR_IMAGE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(INVITE_URL)}&color=38bdf8&bcolor=020617`;

export const GameBoard: React.FC<Props> = ({
  player,
  snakes,
  foods,
  bounds,
  theme,
  mode,
  timeRemainingSeconds,
  lang,
  onSelectLanguage,
  onPointerTarget,
  onSettleWord,
  onSettleSentence,
  onSpillTail,
  t
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [clickEffect, setClickEffect] = useState<{ x: number; y: number; time: number } | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  const mySnake = snakes[`snake-${player.id}`] || Object.values(snakes).find(s => s.playerId === player.id);

  // Keep live values in refs for decoupled 60fps canvas rendering
  const snakesRef = useRef(snakes);
  const foodsRef = useRef(foods);
  const boundsRef = useRef(bounds);
  const mySnakeRef = useRef(mySnake);
  const clickEffectRef = useRef(clickEffect);

  snakesRef.current = snakes;
  foodsRef.current = foods;
  boundsRef.current = bounds;
  mySnakeRef.current = mySnake;
  clickEffectRef.current = clickEffect;

  // Pointer interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const currentMySnake = mySnakeRef.current;
    if (!canvas || !currentMySnake) return;

    const rect = canvas.getBoundingClientRect();
    const touchX = e.clientX - rect.left;
    const touchY = e.clientY - rect.top;

    const cameraZoom = calculateCameraZoom(currentMySnake.totalLength);
    const cameraX = currentMySnake.head.x;
    const cameraY = currentMySnake.head.y;

    // Convert screen coordinates to world coordinates
    const worldX = (touchX - canvas.width / 2) / cameraZoom + cameraX;
    const worldY = (touchY - canvas.height / 2) / cameraZoom + cameraY;

    // Check if tapping player's own snake tail tip to spill foods
    const tailPt = currentMySnake.bodyPath[currentMySnake.bodyPath.length - 1];
    if (tailPt && Math.hypot(worldX - tailPt.x, worldY - tailPt.y) < 40 && currentMySnake.heldFoods.length > 0) {
      onSpillTail();
      setClickEffect({ x: worldX, y: worldY, time: Date.now() });
      audio.playTailSpill();
      return;
    }

    onPointerTarget(worldX, worldY);
    setClickEffect({ x: worldX, y: worldY, time: Date.now() });
    audio.playPickup();
  };

  // Continuous smooth 60fps Canvas Render Loop (Never unmounts or restarts on React re-renders)
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

          const currentSnake = mySnakeRef.current;
          const zoom = calculateCameraZoom(currentSnake ? currentSnake.totalLength : 3);
          renderGame(
            ctx,
            width,
            height,
            boundsRef.current,
            snakesRef.current,
            foodsRef.current,
            currentSnake ? currentSnake.id : null,
            zoom,
            clickEffectRef.current
          );
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, []); // Run ONCE on mount!

  // Evaluate candidate words / sentences
  const heldFoods = mySnake?.heldFoods || [];
  const wordSearch = searchCandidates(heldFoods, theme);
  const sentenceAnalysis = analyzeSentenceBuilding(heldFoods, theme);

  // Leaderboard sorting
  const leaderboard = Object.values(snakes)
    .filter(s => s.connected)
    .sort((a, b) => b.totalLength - a.totalLength);

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-slate-950 select-none">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        className="w-full h-full cursor-crosshair touch-none"
      />

      {/* Top HUD Controls Bar with Mobile Safe Area Support */}
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 right-3 sm:left-4 sm:right-4 flex items-center justify-between pointer-events-none z-20 gap-2">
        {/* Theme & Mode Banner */}
        <div className="bg-slate-900/90 border border-cyan-500/30 backdrop-blur-md rounded-2xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-xl flex items-center gap-2 sm:gap-3">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400 animate-pulse" />
          <div>
            <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-cyan-300 font-bold">
              {mode === 'disaster' ? t('arena.disaster') : mode === 'random' ? t('arena.title') : t('arena.permanent')}
            </div>
            <div className="text-xs sm:text-sm font-black text-white capitalize">
              {theme === 'disaster' ? '防災・安全' : theme}
            </div>
          </div>
        </div>

        {/* 120s Countdown Timer */}
        <div className={`bg-slate-900/90 border backdrop-blur-md rounded-2xl px-4 py-1.5 sm:px-5 sm:py-2 shadow-xl text-center ${
          timeRemainingSeconds <= 10 ? 'border-red-500 text-red-400 animate-bounce' : timeRemainingSeconds <= 30 ? 'border-amber-500 text-amber-300' : 'border-emerald-500/40 text-emerald-400'
        }`}>
          <div className="text-[9px] sm:text-[10px] uppercase font-bold tracking-widest text-slate-400">{t('game.timeRemaining')}</div>
          <div className="text-lg sm:text-xl font-black font-mono">
            {Math.floor(timeRemainingSeconds / 60)}:{(timeRemainingSeconds % 60).toString().padStart(2, '0')}
          </div>
        </div>

        {/* Top Right Actions: Language, FAQ, QR Code */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          {/* QR Code Button */}
          <button
            type="button"
            onClick={() => setShowQRModal(true)}
            className="touch-manipulation p-2 sm:p-2.5 bg-slate-900/90 border border-white/10 hover:border-cyan-400 backdrop-blur-md rounded-2xl text-cyan-400 shadow-xl transition-all active:scale-95"
            title="邀请二维码"
          >
            <QrCode className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* FAQ Button */}
          <button
            type="button"
            onClick={() => setShowRulesModal(true)}
            className="touch-manipulation p-2 sm:p-2.5 bg-slate-900/90 border border-white/10 hover:border-amber-400 backdrop-blur-md rounded-2xl text-amber-400 shadow-xl transition-all active:scale-95"
            title={t('rules.title')}
          >
            <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Language Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="touch-manipulation flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-900/90 border border-white/10 hover:border-cyan-400 backdrop-blur-md rounded-2xl text-xs font-bold text-white shadow-xl transition-all active:scale-95"
            >
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
              <span className="uppercase text-[11px] sm:text-xs">{lang}</span>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-36 bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-40">
                {[
                  { code: 'zh-CN', label: '简体中文' },
                  { code: 'ja', label: '日本語' },
                  { code: 'en', label: 'English' },
                  { code: 'zh-TW', label: '繁體中文' }
                ].map(item => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      saveLanguagePreference(item.code as Language);
                      onSelectLanguage(item.code as Language);
                      setShowLangMenu(false);
                    }}
                    className={`touch-manipulation w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-slate-800 transition-colors ${
                      lang === item.code ? 'text-cyan-400 bg-cyan-950/40' : 'text-slate-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Candidate Prompt Bubble (Positioned fixed directly above Player Snake Head at Screen Center) */}
      <div className="absolute top-[calc(50%-85px)] left-1/2 -translate-x-1/2 -translate-y-full z-30 flex flex-col items-center gap-3 max-w-md w-full px-4 pointer-events-auto">
        {/* Candidate Sentence Bubbles (GOLD ONLY) */}
        {sentenceAnalysis.isSentenceReady && sentenceAnalysis.candidates.map(candidate => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => {
              audio.playSentenceCompleted();
              onSettleSentence(candidate);
            }}
            className="touch-manipulation w-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 border-2 border-yellow-200 text-slate-950 font-black py-3 px-6 rounded-2xl shadow-2xl shadow-yellow-500/50 hover:scale-105 active:scale-95 transition-transform flex items-center justify-between"
          >
            <span className="text-lg tracking-wide">{candidate.text}</span>
            <span className="text-xs bg-black text-yellow-300 font-extrabold px-3 py-1 rounded-full">
              金旗句 (+{candidate.totalLengthBonus})
            </span>
          </button>
        ))}

        {/* Candidate Word Bubbles (NO GOLD) */}
        {!sentenceAnalysis.isSentenceReady && wordSearch.status === 'WORD_READY' && wordSearch.candidates.map(candidate => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => {
              audio.playWordCompleted();
              onSettleWord(candidate);
            }}
            className="touch-manipulation w-full bg-slate-900/95 border-2 border-cyan-400 backdrop-blur-xl text-cyan-300 font-black py-3 px-6 rounded-2xl shadow-2xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-between"
          >
            <div className="text-left">
              <div className="text-lg text-white font-extrabold">{candidate.canonical}</div>
              <div className="text-xs text-cyan-400">{candidate.reading} · {candidate.meaning}</div>
            </div>
            <span className="text-xs bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-extrabold px-3 py-1 rounded-full">
              拼成! (+{candidate.readingLength})
            </span>
          </button>
        ))}
      </div>

      {/* FAQ / Rules Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 max-w-md w-full text-left space-y-4 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowRulesModal(false)}
              className="touch-manipulation absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <HelpCircle className="w-6 h-6 text-amber-400" />
              <h3 className="text-lg font-black text-white">{t('rules.title')}</h3>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>{t('rules.1')}</p>
              <p>{t('rules.2')}</p>
              <p>{t('rules.3')}</p>
              <p>{t('rules.4')}</p>
              <p>{t('rules.5')}</p>
            </div>

            <button
              type="button"
              onClick={() => setShowRulesModal(false)}
              className="touch-manipulation w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl"
            >
              {t('rules.close')}
            </button>
          </div>
        </div>
      )}

      {/* QR Code Invitation Modal */}
      {showQRModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowQRModal(false)}
              className="touch-manipulation absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-center gap-2">
              <QrCode className="w-6 h-6 text-cyan-400" />
              <h3 className="text-lg font-black text-white">游戏邀请二维码</h3>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 inline-block shadow-inner">
              <img
                src={QR_IMAGE_URL}
                alt="Invite QR Code"
                className="w-44 h-44 rounded-xl object-contain"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-400">手机扫码或浏览器输入网址加入：</p>
              <a
                href={INVITE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 font-mono font-bold hover:underline text-sm block"
              >
                {INVITE_URL.replace('https://', '')}
              </a>
            </div>

            <button
              type="button"
              onClick={() => setShowQRModal(false)}
              className="touch-manipulation w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl"
            >
              {t('rules.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameBoard;
