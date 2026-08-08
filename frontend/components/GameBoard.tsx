import React, { useEffect, useRef, useState } from 'react';
import { ArenaBounds, CandidateSentence, CandidateWord, FoodState, Language, Player, SnakeState, Theme } from '../types';
import { calculateCameraZoom } from '../game/snakeMovement';
import { renderGame } from '../game/snakeRenderer';
import { searchCandidates } from '../language/trieEngine';
import { analyzeSentenceBuilding } from '../language/sentenceEngine';
import { audio } from '../audio';
import { saveLanguagePreference } from '../i18n';
import { Trophy, Sparkles, Globe, HelpCircle, QrCode, X } from 'lucide-react';

type MutableRef<T> = React.MutableRefObject<T>;

interface Props {
  player: Player;
  snakesRef: MutableRef<Record<string, SnakeState>>;
  foodsRef: MutableRef<Record<string, FoodState>>;
  boundsRef: MutableRef<ArenaBounds>;
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
  snakesRef,
  foodsRef,
  boundsRef,
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
  const isInteractingRef = useRef(false);
  const clickEffectRef = useRef(clickEffect);
  clickEffectRef.current = clickEffect;

  const cameraXRef = useRef(0);
  const cameraYRef = useRef(0);
  const cameraZoomRef = useRef(1.2);

  // HUD state: synced from refs every 150ms for React UI elements
  const [hudSnakes, setHudSnakes] = useState<Record<string, SnakeState>>({});
  useEffect(() => {
    const interval = setInterval(() => {
      setHudSnakes({ ...snakesRef.current });
    }, 150);
    return () => clearInterval(interval);
  }, [snakesRef]);

  // Helper to dynamically get current local player snake (reads from live ref)
  const getMySnake = () => {
    const all = snakesRef.current;
    return all[`snake-${player.id}`] || Object.values(all).find(s => s.playerId === player.id) || Object.values(all)[0];
  };

  // Convert screen coordinates to world coordinates & trigger target move
  const updatePointerTarget = (touchX: number, touchY: number, isInitialTap = false) => {
    const canvas = canvasRef.current;
    const currentMySnake = getMySnake();
    if (!canvas || !currentMySnake) return;

    const cameraZoom = calculateCameraZoom(currentMySnake.totalLength);
    const cameraX = currentMySnake.head.x;
    const cameraY = currentMySnake.head.y;

    const worldX = (touchX - canvas.width / 2) / cameraZoom + cameraX;
    const worldY = (touchY - canvas.height / 2) / cameraZoom + cameraY;

    if (isInitialTap) {
      const tailPt = currentMySnake.bodyPath[currentMySnake.bodyPath.length - 1];
      if (tailPt && Math.hypot(worldX - tailPt.x, worldY - tailPt.y) < 40 && currentMySnake.heldFoods.length > 0) {
        onSpillTail();
        setClickEffect({ x: worldX, y: worldY, time: Date.now() });
        audio.playTailSpill();
        return;
      }
      setClickEffect({ x: worldX, y: worldY, time: Date.now() });
    }

    onPointerTarget(worldX, worldY);
  };

  // Pointer Down (Mouse click or initial touch down)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isInteractingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    updatePointerTarget(e.clientX - rect.left, e.clientY - rect.top, true);
  };

  // Pointer Move (Mouse drag or finger drag)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInteractingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    updatePointerTarget(e.clientX - rect.left, e.clientY - rect.top, false);
  };

  const handlePointerUp = () => {
    isInteractingRef.current = false;
  };

  // Touch Move for Mobile Web (Safari / Chrome touch drag)
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    updatePointerTarget(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top, false);
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

          const currentSnake = getMySnake();
          const targetZoom = calculateCameraZoom(currentSnake ? currentSnake.totalLength : 3);
          const targetX = currentSnake ? currentSnake.head.x : 0;
          const targetY = currentSnake ? currentSnake.head.y : 0;
          
          // Smooth camera lerp (0.12 = smooth follow speed)
          const lerp = 0.12;
          cameraXRef.current += (targetX - cameraXRef.current) * lerp;
          cameraYRef.current += (targetY - cameraYRef.current) * lerp;
          cameraZoomRef.current += (targetZoom - cameraZoomRef.current) * lerp;

          renderGame(
            ctx,
            width,
            height,
            boundsRef.current,
            snakesRef.current,
            foodsRef.current,
            currentSnake ? currentSnake.id : null,
            cameraZoomRef.current,
            clickEffectRef.current,
            { x: cameraXRef.current, y: cameraYRef.current }
          );
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, []); // Run ONCE on mount!

  const mySnake = getMySnake();
  const heldFoods = mySnake?.heldFoods || [];
  const wordSearch = searchCandidates(heldFoods, theme);
  const sentenceAnalysis = analyzeSentenceBuilding(heldFoods, theme);

  // Projection formula: calculate exact screen pixel coordinates of snake head
  const cameraX = cameraXRef.current;
  const cameraY = cameraYRef.current;
  const zoom = cameraZoomRef.current;
  const headScreenX = mySnake ? (mySnake.head.x - cameraX) * zoom + window.innerWidth / 2 : window.innerWidth / 2;
  const headScreenY = mySnake ? (mySnake.head.y - cameraY) * zoom + window.innerHeight / 2 : window.innerHeight / 2;

  // Leaderboard shows ONLY earnedLength (excluding base 3 length)
  const leaderboard = Object.values(hudSnakes)
    .filter(s => s.connected)
    .sort((a, b) => b.earnedLength - a.earnedLength);

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-slate-950 select-none">
      {/* Canvas with Mouse & Touch Event Handlers */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={(e) => {
          if (e.touches.length > 0) {
            const canvas = canvasRef.current;
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              updatePointerTarget(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top, true);
            }
          }
        }}
        onTouchMove={handleTouchMove}
        className="w-full h-full cursor-crosshair touch-none"
      />

      {/* Top HUD Controls Bar with Mobile Safe Area Support */}
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 right-3 sm:left-4 sm:right-4 flex items-center justify-between pointer-events-none z-20 gap-2">
        {/* Theme & Mode Banner */}
        <div className="bg-slate-900/90 border border-cyan-500/30 backdrop-blur-md rounded-2xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-xl flex items-center gap-2 sm:gap-3">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400 animate-pulse" />
          <div>
            <div className="text-[9px] sm:text-[10px] tracking-wider text-cyan-300 font-bold">
              {mode === 'disaster' ? t('arena.disaster') : mode === 'random' ? t('arena.title') : t('arena.permanent')}
            </div>
            <div className="text-xs sm:text-sm font-black text-white">
              {t(`theme.${theme}`)}
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

          {/* Language Switcher Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="touch-manipulation flex items-center gap-1 px-2.5 py-2 sm:px-3 sm:py-2 bg-slate-900/90 border border-white/10 hover:border-cyan-400 backdrop-blur-md rounded-2xl text-xs font-bold shadow-xl active:scale-95"
            >
              <Globe className="w-4 h-4 text-cyan-400" />
              <span className="uppercase">{lang}</span>
            </button>

            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-32 bg-slate-900/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-30 backdrop-blur-xl">
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
                    className={`touch-manipulation w-full text-left px-3 py-2 text-xs font-bold hover:bg-slate-800 transition-colors ${
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

      {/* Floating Candidate Prompt Bubble DIRECTLY ABOVE PLAYER SNAKE HEAD */}
      {mySnake && (wordSearch.status === 'WORD_READY' || sentenceAnalysis.isSentenceReady) && (
        <div
          className="fixed pointer-events-auto z-40 -translate-x-1/2 -translate-y-full transition-transform duration-75 flex flex-col items-center gap-2"
          style={{
            left: `${headScreenX}px`,
            top: `${headScreenY - 60 * zoom}px`
          }}
        >
          {sentenceAnalysis.isSentenceReady && sentenceAnalysis.candidates[0] && (
            <button
              type="button"
              onClick={() => onSettleSentence(sentenceAnalysis.candidates[0])}
              className="touch-manipulation animate-bounce px-8 py-4 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-slate-950 font-black text-xl sm:text-2xl rounded-3xl shadow-2xl border-4 border-white flex items-center gap-3 cursor-pointer active:scale-95 whitespace-nowrap scale-110 sm:scale-125 origin-bottom"
            >
              <Sparkles className="w-7 h-7 fill-current text-slate-950" />
              <span>【{sentenceAnalysis.candidates[0].text}】</span>
            </button>
          )}

          {wordSearch.status === 'WORD_READY' && wordSearch.candidates[0] && (
            <button
              type="button"
              onClick={() => onSettleWord(wordSearch.candidates[0])}
              className="touch-manipulation animate-pulse px-7 py-3.5 bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-black text-lg sm:text-xl rounded-3xl shadow-2xl border-4 border-white flex items-center gap-2.5 cursor-pointer active:scale-95 whitespace-nowrap scale-110 sm:scale-125 origin-bottom"
            >
              <Sparkles className="w-6 h-6 fill-current text-slate-950" />
              <span>【{wordSearch.candidates[0].canonical}】</span>
            </button>
          )}
        </div>
      )}

      {/* Compact Mobile Leaderboard Panel (Displays ONLY color dot, 1st char of name, earnedLength) */}
      <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-2 sm:left-4 bg-slate-900/80 border border-white/10 backdrop-blur-md rounded-2xl p-1.5 sm:p-3 shadow-2xl z-20 max-w-[110px] sm:max-w-[200px] pointer-events-none">
        <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-black text-amber-400 border-b border-white/10 pb-1 mb-1.5">
          <Trophy className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">{t('leaderboard.title')}</span><span className="sm:hidden">榜</span>
        </div>
        <div className="space-y-1 text-[10px] sm:text-[11px] font-bold">
          {leaderboard.slice(0, 5).map((s, idx) => (
            <div
              key={s.id}
              className={`flex items-center justify-between gap-1 sm:gap-2 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg sm:rounded-xl ${
                s.id === mySnake?.id ? 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-300' : 'text-slate-300'
              }`}
            >
              <div className="flex items-center gap-1 truncate">
                <span className="text-[8px] sm:text-[9px] text-slate-400 font-mono">#{idx + 1}</span>
                <span
                  className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: s.baseColor }}
                />
                {/* Mobile: 1st character of name only; Desktop: full nickname */}
                <span className="sm:hidden font-black">{Array.from(s.nickname)[0] || '?'}</span>
                <span className="hidden sm:inline truncate">{s.nickname}</span>
              </div>
              <span className="font-mono text-slate-200 text-[9px] sm:text-xs">+{s.earnedLength}{t('leaderboard.unit')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
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
              className="touch-manipulation w-full py-3 bg-cyan-500 text-slate-950 font-black rounded-xl"
            >
              {t('rules.close')}
            </button>
          </div>
        </div>
      )}

      {showQRModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-8 max-w-sm w-full text-center space-y-5 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowQRModal(false)}
              className="touch-manipulation absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center justify-center gap-2">
              <QrCode className="w-6 h-6 text-cyan-400" />
              <h3 className="text-lg font-black text-white">{t('qr.title')}</h3>
            </div>
            <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 inline-block">
              <img src={QR_IMAGE_URL} alt="QR Code" className="w-48 h-48 rounded-xl object-contain" />
            </div>
            <p className="text-xs text-slate-400">
              {t('qr.url')}：<a href={INVITE_URL} target="_blank" rel="noreferrer" className="text-cyan-400 font-mono font-bold hover:underline">h.kazeabc.com</a>
            </p>
            <button
              type="button"
              onClick={() => setShowQRModal(false)}
              className="touch-manipulation w-full py-3 bg-cyan-500 text-slate-950 font-black rounded-xl"
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
