import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArenaBounds, ArenaMode, ArenaState, CandidateSentence, CandidateWord, FoodState, GamePhase, Language, Player, SnakeState, Theme } from './types';
import { translations, getBrowserLanguage } from './i18n';
import GameBoard from './components/GameBoard';
import LobbyScreen from './components/LobbyScreen';
import TheaterScreen from './components/TheaterScreen';
import GameOffScreen from './components/GameOffScreen';
import ConnectionStatus from './components/ConnectionStatus';
import { audio } from './audio';
import { useSnakeSamuraiMultiplayer } from './useSnakeSamuraiMultiplayer';
import { generateSingleFood } from './game/foodGenerator';
import { updateSnakePosition } from './game/snakeMovement';
import { checkAndResolveCollisions } from './game/collisionEngine';
import { settleSentence, settleWord } from './game/settleManager';
import { updateBotAI } from './game/botAI';
import { searchCandidates } from './language/trieEngine';
import { analyzeSentenceBuilding } from './language/sentenceEngine';

const requestedSnakeRoom = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('arena') : null;
const SNAKE_SAMURAI_ROOM_ID = requestedSnakeRoom === 'snake-theme' || requestedSnakeRoom === 'snake-disaster'
  ? requestedSnakeRoom : 'snake-free';

const INITIAL_BOUNDS: ArenaBounds = { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
const ROOM_MODE: ArenaMode = SNAKE_SAMURAI_ROOM_ID === 'snake-disaster' ? 'disaster' : SNAKE_SAMURAI_ROOM_ID === 'snake-theme' ? 'random' : 'free';
const ROOM_THEME: Theme = SNAKE_SAMURAI_ROOM_ID === 'snake-disaster' ? 'disaster' : SNAKE_SAMURAI_ROOM_ID === 'snake-theme' ? 'travel' : 'free';
const KATAKANA = ['アオイ', 'カゼ', 'ソラ', 'ナギ', 'リン', 'ユキ', 'ハル', 'レイ', 'ミオ', 'ルイ'];
const randomKatakana = () => KATAKANA[Math.floor(Math.random() * KATAKANA.length)] + Math.floor(10 + Math.random() * 90);


const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(getBrowserLanguage());
  const [phase, setPhase] = useState<GamePhase>(GamePhase.LOBBY);
  const [showLobbyFromResults, setShowLobbyFromResults] = useState(false);
  const [mode, setMode] = useState<ArenaMode>(ROOM_MODE);
  const [theme, setTheme] = useState<Theme>(ROOM_THEME);
  const [lobbyEndsAt, setLobbyEndsAt] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(120);
  const [bounds, setBounds] = useState<ArenaBounds>(INITIAL_BOUNDS);
  const [themeAlert, setThemeAlert] = useState('');
  const [controlError, setControlError] = useState('');
  const [tailSpillEffect, setTailSpillEffect] = useState<{ victimId: string; at: number } | null>(null);

  // Player State
  const [player, setPlayer] = useState<Player>(() => ({
    id: `p-${Date.now()}`,
    name: localStorage.getItem('kazeabc_name') || randomKatakana(),
    color: localStorage.getItem('kazeabc_color') || '#3b82f6',
    isBot: false,
    isSpectator: true
  }));

  // Game State (React UI rendering)
  const [snakes, setSnakes] = useState<Record<string, SnakeState>>({});
  const [foods, setFoods] = useState<Record<string, FoodState>>({});

  // Single Source of Truth Refs for Physics & 60fps Game Engine
  const phaseRef = useRef(phase);
  const startedAtRef = useRef(startedAt);
  const snakesRef = useRef<Record<string, SnakeState>>({});
  const foodsRef = useRef<Record<string, FoodState>>({});
  const boundsRef = useRef<ArenaBounds>(INITIAL_BOUNDS);
  const themeRef = useRef(theme);
  const battleMusicRef = useRef<'BATTLE' | 'BLADE_BATTLE'>('BATTLE');
  const startAttemptForDeadlineRef = useRef<number | null>(null);
  const serverClockShiftRef = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    if (phase !== GamePhase.THEATER) setShowLobbyFromResults(false);
  }, [phase]);
  useEffect(() => { startedAtRef.current = startedAt; }, [startedAt]);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  useEffect(() => {
    const unlockAudio = () => audio.init();
    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    document.addEventListener('touchend', unlockAudio, { passive: true });
    document.addEventListener('keydown', unlockAudio);
    const resumeAudio = () => { if (!document.hidden) audio.init(); };
    document.addEventListener('visibilitychange', resumeAudio);
    return () => {
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('touchend', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      document.removeEventListener('visibilitychange', resumeAudio);
    };
  }, []);

  const handleUpdatePlayer = (name: string, color: string) => {
    localStorage.setItem('kazeabc_name', name);
    localStorage.setItem('kazeabc_color', color);
    setPlayer(prev => ({ ...prev, name, color }));
  };

  const applyCanonicalSnapshot = useCallback((snapshot: ArenaState & { lobbyEndsAt?: number | null }, clockShift = 0) => {
    if (!snapshot || !Object.values(GamePhase).includes(snapshot.phase)) return false;
    const previousPhase = phaseRef.current;
    const sameLiveRound = previousPhase === GamePhase.PLAYING && snapshot.phase === GamePhase.PLAYING
      && startedAtRef.current === snapshot.startedAt;
    const oldSnake = snakesRef.current[`snake-${player.id}`];
    const ownSnake = snapshot.snakes?.[`snake-${player.id}`];
    if (sameLiveRound && oldSnake && ownSnake) {
      if (ownSnake.heldFoods.length > oldSnake.heldFoods.length) audio.playPickup();
      for (const record of ownSnake.completionHistory.slice(oldSnake.completionHistory.length)) {
        if (record.type === 'word') audio.playWordCompleted();
        else audio.playSentenceCompleted();
      }
    }
    snakesRef.current = snapshot.snakes || {};
    foodsRef.current = snapshot.foods || {};
    boundsRef.current = snapshot.bounds || INITIAL_BOUNDS;
    setSnakes({ ...snakesRef.current });
    setFoods({ ...foodsRef.current });
    setBounds(boundsRef.current);
    if (snapshot.mode) setMode(snapshot.mode);
    if (snapshot.theme) { themeRef.current = snapshot.theme; setTheme(snapshot.theme); }
    serverClockShiftRef.current = clockShift;
    startedAtRef.current = typeof snapshot.startedAt === 'number' ? snapshot.startedAt : null;
    setStartedAt(startedAtRef.current);
    setLobbyEndsAt(typeof snapshot.lobbyEndsAt === 'number' ? snapshot.lobbyEndsAt : null);
    phaseRef.current = snapshot.phase;
    setPhase(snapshot.phase);
    if (snapshot.phase === GamePhase.OFF) audio.setBGM('OFF');
    else if (snapshot.phase === GamePhase.PLAYING && previousPhase !== GamePhase.PLAYING) {
      audio.init(); battleMusicRef.current = 'BATTLE'; audio.setBGM('BATTLE');
    }
    setControlError('');
    return true;
  }, [player.id]);

  // All authority and identity arrive through verified host frames.
  const { userId, isHost, isJoined, connection, connectionFailure, retryConnection, registrationError, onlinePlayers, joinMatch, sendIntent,
    sendMoveIntent, broadcastSnapshot, broadcastTailSpill, requestSnapshot } = useSnakeSamuraiMultiplayer({
    roomId: SNAKE_SAMURAI_ROOM_ID,
    player,
    onSnapshot: applyCanonicalSnapshot,
    onTailSpill: victimId => { setTailSpillEffect({ victimId, at: Date.now() }); audio.playTailSpill(); },
  });

  useEffect(() => {
    if (userId && player.id !== userId) setPlayer(previous => ({ ...previous, id: userId }));
  }, [userId, player.id]);

  // A lobby deadline asks once for the canonical state. A missing deadline
  // waits for push and never creates a polling or claim-start loop.
  useEffect(() => {
    if (phase !== GamePhase.LOBBY || !Number.isFinite(lobbyEndsAt) || lobbyEndsAt === null) return;
    const deadline = lobbyEndsAt;
    const timer = window.setTimeout(() => {
      if (startAttemptForDeadlineRef.current === deadline) return;
      startAttemptForDeadlineRef.current = deadline;
      void requestSnapshot();
    }, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [phase, lobbyEndsAt, requestSnapshot]);

  // All clients derive both the HUD timer and music stage from the same
  // server-normalized start time, independent of physics host election.
  useEffect(() => {
    if (phase === GamePhase.THEATER) {
      audio.setBGM('DEFEAT');
      return;
    }
    if (phase !== GamePhase.PLAYING || !startedAt) return;
    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setTimeRemaining(Math.max(0, 120 - elapsed));
      const nextMusic = elapsed >= 60 ? 'BLADE_BATTLE' : 'BATTLE';
      if (battleMusicRef.current !== nextMusic) battleMusicRef.current = nextMusic;
      audio.setBGM(nextMusic);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);

  // Clean 60fps Game Loop using mutable refs
  useEffect(() => {
    if (phase !== GamePhase.PLAYING || !isHost) return;
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (phaseRef.current !== GamePhase.PLAYING) return;

      const deltaSeconds = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      // 1. Update 120s match timer & Boundary Shrinking
      let currentBounds = boundsRef.current;
      const currentStartedAt = startedAtRef.current;
      if (currentStartedAt) {
        const elapsed = Math.floor((Date.now() - currentStartedAt) / 1000);
        const remaining = Math.max(0, 120 - elapsed);
        setTimeRemaining(remaining);

        // Escalate the battle soundtrack exactly one minute into a round.
        const nextMusic = elapsed >= 60 ? 'BLADE_BATTLE' : 'BATTLE';
        if (battleMusicRef.current !== nextMusic) {
          battleMusicRef.current = nextMusic;
          audio.setBGM(nextMusic);
        }

        if (remaining <= 0) {
          const finalSnapshot: ArenaState = {
            id: SNAKE_SAMURAI_ROOM_ID, mode, theme: themeRef.current, phase: GamePhase.THEATER,
            startedAt: currentStartedAt - serverClockShiftRef.current,
            endsAt: currentStartedAt - serverClockShiftRef.current + 120_000,
            bounds: boundsRef.current, snakes: snakesRef.current, foods: foodsRef.current,
            leaderboard: [], version: 1,
          };
          broadcastSnapshot(finalSnapshot);
          phaseRef.current = GamePhase.THEATER;
          setPhase(GamePhase.THEATER);
          audio.playVictory();
          audio.setBGM('DEFEAT');
          return;
        }

        const shrinkFactor = elapsed / 240;
        const currentSize = 1000 - shrinkFactor * 200;
        currentBounds = { minX: -currentSize, maxX: currentSize, minY: -currentSize, maxY: currentSize };
        boundsRef.current = currentBounds;
      }

      // 2. Perform frame calculations on ref data
      const prevFoods = foodsRef.current;
      let prevSnakes = { ...snakesRef.current };
      const currentTheme = themeRef.current;

      let updatedFoods = { ...prevFoods };

      // Respawn out-of-bounds ground foods
      for (const fId of Object.keys(updatedFoods)) {
        const food = updatedFoods[fId];
        if (food.state !== 'ground') continue;
        if (
          food.x < currentBounds.minX || food.x > currentBounds.maxX ||
          food.y < currentBounds.minY || food.y > currentBounds.maxY
        ) {
          updatedFoods[fId] = generateSingleFood(fId, currentBounds);
        }
      }

      // Check if ground food count dropped below threshold (playerCount * 12)
      const playerCount = Math.max(1, Object.keys(prevSnakes).length);
      const targetMin = playerCount * 12;
      const groundCount = Object.values(updatedFoods).filter(f => f.state === 'ground').length;

      if (groundCount < targetMin) {
        const missing = targetMin - groundCount;
        for (let i = 0; i < missing; i++) {
          const newId = `food-replenish-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
          updatedFoods[newId] = generateSingleFood(newId, currentBounds);
        }
      }

      // Update Bot AI & Snake physics
      const updatedSnakes: Record<string, SnakeState> = {};
      for (const sId of Object.keys(prevSnakes)) {
        let snake = prevSnakes[sId];

        if (snake.isBot) {
          const aiDecision = updateBotAI(snake, prevSnakes, updatedFoods, currentBounds, currentTheme);
          snake = { ...snake, target: aiDecision.target };

          if (aiDecision.shouldSettleSentenceIndex !== undefined && snake.buildState.sentenceCandidates[0]) {
            const res = settleSentence(snake, snake.buildState.sentenceCandidates[0], updatedFoods, currentBounds, currentTheme);
            snake = res.updatedSnake;
            updatedFoods = res.updatedFoods;
          } else if (aiDecision.shouldSettleWordIndex !== undefined && snake.buildState.candidates[0]) {
            const res = settleWord(snake, snake.buildState.candidates[0], updatedFoods, currentBounds, currentTheme);
            snake = res.updatedSnake;
            updatedFoods = res.updatedFoods;
          }
        }

        const movedSnake = updateSnakePosition(snake, deltaSeconds, currentBounds, prevSnakes);
        const wordSearch = searchCandidates(movedSnake.heldFoods, currentTheme);
        const sentenceAnalysis = analyzeSentenceBuilding(movedSnake.heldFoods, currentTheme);

        let buildStatus = wordSearch.status;
        if (sentenceAnalysis.isSentenceReady) {
          buildStatus = 'SENTENCE_READY';
        } else if (sentenceAnalysis.isSentenceBuilding) {
          buildStatus = 'SENTENCE_BUILDING';
        }

        updatedSnakes[sId] = {
          ...movedSnake,
          buildState: {
            status: buildStatus,
            candidates: wordSearch.candidates,
            sentenceCandidates: sentenceAnalysis.candidates,
            version: (movedSnake.buildState.version || 0) + 1
          }
        };
      }

      // Resolve collisions
      const colRes = checkAndResolveCollisions(updatedSnakes, updatedFoods, currentBounds);
      if (colRes.events.spills.length > 0) {
        audio.playTailSpill();
        colRes.events.spills.forEach(event => broadcastTailSpill(event.victimId));
      }
      if (colRes.events.foodPickups.length > 0) {
        audio.playPickup();
      }

      // Update refs
      snakesRef.current = colRes.updatedSnakes;
      foodsRef.current = colRes.updatedFoods;

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [phase, player, isHost, mode, broadcastSnapshot, broadcastTailSpill]);

  // Note: GameBoard reads directly from snakesRef/foodsRef/boundsRef for 60fps rendering
  // and manages its own 150ms HUD sync internally.

  // Pointer target input
  const handlePointerTarget = (x: number, y: number) => {
    sendMoveIntent(x, y);
    const mySnakeId = `snake-${player.id}`;
    const s = snakesRef.current[mySnakeId];
    if (s) {
      const updated = { ...snakesRef.current, [mySnakeId]: { ...s, target: { x, y } } };
      snakesRef.current = updated;
    }
  };

  // Candidates shown by the UI identify only an index. The host recomputes
  // held-food candidates and owns all language validation, score and spills.
  const handleSettleWord = (candidate: CandidateWord) => {
    const snake = snakesRef.current[`snake-${player.id}`];
    if (!snake) return;
    const candidateIndex = searchCandidates(snake.heldFoods, themeRef.current).candidates.findIndex(item => item.id === candidate.id);
    if (candidateIndex >= 0) void sendIntent({ type: 'settle_word', candidateIndex });
  };
  const handleSettleSentence = (candidate: CandidateSentence) => {
    const snake = snakesRef.current[`snake-${player.id}`];
    if (!snake) return;
    const candidateIndex = analyzeSentenceBuilding(snake.heldFoods, themeRef.current).candidates.findIndex(item => item.id === candidate.id);
    if (candidateIndex >= 0) void sendIntent({ type: 'settle_sentence', candidateIndex });
  };
  const spillOwnTail = () => { void sendIntent({ type: 'spill_tail' }); };
  const handleComposeHeldFoods = () => { void sendIntent({ type: 'compose' }); };

  const arenaState: ArenaState = {
    id: SNAKE_SAMURAI_ROOM_ID,
    mode,
    theme,
    phase,
    startedAt,
    endsAt: startedAt ? startedAt + 120_000 : null,
    bounds: boundsRef.current,
    snakes: snakesRef.current,
    foods: foodsRef.current,
    leaderboard: [],
    version: 1
  };

  return (
    <div className="w-screen h-[100dvh] bg-slate-950 text-white font-sans overflow-hidden">
      <ConnectionStatus failure={connectionFailure} busy={connection === 'connecting'} roomId={SNAKE_SAMURAI_ROOM_ID} site="h.kazeabc.com" onRetry={retryConnection} t={key => translations[lang]?.[key] || key} />
      {themeAlert && <div role="alert" className="fixed inset-0 z-[200] grid place-items-center overflow-hidden bg-red-950/55 backdrop-blur-sm animate-pulse">
        <div className="absolute inset-0 opacity-80" style={{background:'linear-gradient(31deg,transparent 46%,#fff 47%,transparent 48%),linear-gradient(147deg,transparent 45%,#fb7185 46%,transparent 47%),linear-gradient(72deg,transparent 52%,#fff 53%,transparent 54%)'}} />
        <div className="relative rounded-3xl border-4 border-red-200 bg-slate-950/90 px-8 py-6 text-center text-2xl font-black shadow-[0_0_80px_#ef4444]">⚡ 与本场主题不相关<br/><span className="mt-2 block text-base text-red-200">{themeAlert}</span></div>
      </div>}
      {phase === GamePhase.OFF && (
        <GameOffScreen t={(k) => translations[lang]?.[k] || k} arenaName="聴風・侍蛇" gameUrl="https://h.kazeabc.com" />
      )}
      {(phase === GamePhase.LOBBY || phase === GamePhase.THEATER && showLobbyFromResults) && (
        <LobbyScreen
          player={player}
          players={onlinePlayers}
          isJoined={isJoined}
          onJoinChange={isSpectator => { void joinMatch(isSpectator); }}
          selectedMode={mode}
          selectedTheme={theme}
          onUpdatePlayer={handleUpdatePlayer}
          lang={lang}
          onSelectLanguage={setLang}
          lobbyEndsAt={lobbyEndsAt}
          connectionUnavailable={Boolean(connectionFailure)}
          connectionError={controlError || registrationError}
          t={(k) => translations[lang]?.[k] || k}
        />
      )}

      {phase === GamePhase.PLAYING && (
        <GameBoard
          player={player}
          snakesRef={snakesRef}
          foodsRef={foodsRef}
          boundsRef={boundsRef}
          theme={theme}
          mode={mode}
          timeRemainingSeconds={timeRemaining}
          lang={lang}
          onSelectLanguage={setLang}
          onPointerTarget={handlePointerTarget}
          onSettleWord={handleSettleWord}
          onSettleSentence={handleSettleSentence}
          onComposeHeldFoods={handleComposeHeldFoods}
          onSpillTail={spillOwnTail}
          tailSpillEffect={tailSpillEffect}
          t={(k) => translations[lang]?.[k] || k}
        />
      )}

      {phase === GamePhase.THEATER && !showLobbyFromResults && (
        <TheaterScreen
          arenaState={arenaState}
          player={player}
          onRestart={() => setShowLobbyFromResults(true)}
          t={(k) => translations[lang]?.[k] || k}
        />
      )}
    </div>
  );
};

export default App;
