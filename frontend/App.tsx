import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArenaBounds, ArenaMode, ArenaState, CandidateSentence, CandidateWord, FoodState, GamePhase, Language, Player, SnakeState, Theme } from './types';
import { translations, getBrowserLanguage } from './i18n';
import GameBoard from './components/GameBoard';
import LobbyScreen from './components/LobbyScreen';
import TheaterScreen from './components/TheaterScreen';
import RemoteControl from './components/RemoteControl';
import { audio } from './audio';
import { useSnakeSamuraiMultiplayer } from './useSnakeSamuraiMultiplayer';
import { generateInitialFoods, generateSingleFood } from './game/foodGenerator';
import { updateSnakePosition } from './game/snakeMovement';
import { checkAndResolveCollisions, triggerSelfTailSpill } from './game/collisionEngine';
import { settleSentence, settleWord } from './game/settleManager';
import { updateBotAI } from './game/botAI';
import { searchCandidates } from './language/trieEngine';
import { analyzeSentenceBuilding } from './language/sentenceEngine';

const IS_REMOTE = window.location.pathname.replace(/\/$/, '') === '/r';
const INITIAL_BOUNDS: ArenaBounds = { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
const KATAKANA = ['アオイ', 'カゼ', 'ソラ', 'ナギ', 'リン', 'ユキ', 'ハル', 'レイ', 'ミオ', 'ルイ'];
const randomKatakana = () => KATAKANA[Math.floor(Math.random() * KATAKANA.length)] + Math.floor(10 + Math.random() * 90);

const INITIAL_BOTS = [
  { id: 'bot-1', name: '侍カゼ', color: '#ef4444' },
  { id: 'bot-2', name: '忍者ソラ', color: '#10b981' },
  { id: 'bot-3', name: '武士ナギ', color: '#8b5cf6' }
];

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(getBrowserLanguage());
  const [phase, setPhase] = useState<GamePhase>(GamePhase.LOBBY);
  const [mode, setMode] = useState<ArenaMode>('free');
  const [theme, setTheme] = useState<Theme>('free');
  const [lobbyEndsAt, setLobbyEndsAt] = useState<number | null>(Date.now() + 30_000);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(120);
  const [bounds, setBounds] = useState<ArenaBounds>(INITIAL_BOUNDS);

  // Player State
  const [player, setPlayer] = useState<Player>(() => ({
    id: `p-${Date.now()}`,
    name: localStorage.getItem('kazeabc_name') || randomKatakana(),
    color: localStorage.getItem('kazeabc_color') || '#3b82f6',
    isBot: false
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

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { startedAtRef.current = startedAt; }, [startedAt]);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  const handleUpdatePlayer = (name: string, color: string) => {
    localStorage.setItem('kazeabc_name', name);
    localStorage.setItem('kazeabc_color', color);
    setPlayer(prev => ({ ...prev, name, color }));
  };

  // Helper function to create player snake
  const createPlayerSnake = useCallback((p: Player): SnakeState => {
    const mySnakeId = `snake-${p.id}`;
    const initialPath = Array.from({ length: 9 }, (_, i) => ({ x: -i * 14, y: 0 }));
    return {
      id: mySnakeId,
      playerId: p.id,
      nickname: p.name,
      baseColor: p.color,
      head: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      target: { x: 100, y: 0 },
      bodyPath: initialPath,
      bodySegments: Array.from({ length: 3 }, (_, i) => ({
        id: `base-seg-${i}`,
        type: 'base',
        lengthUnits: 1,
        colorMode: 'player',
        color: p.color
      })),
      baseLength: 3,
      earnedLength: 0,
      totalLength: 3,
      currentSpeed: 180,
      heldFoods: [],
      buildState: { status: 'INVALID', candidates: [], sentenceCandidates: [], version: 1 },
      completionHistory: [],
      isBot: false,
      connected: true
    };
  }, []);

  // Multiplayer Hook
  const { isHost, sendMoveIntent } = useSnakeSamuraiMultiplayer({
    roomId: 'main',
    player,
    onCommand: async (cmd, payload) => {
      if (cmd === 'on' || cmd === 'restart') {
        if (payload.mode) setMode(payload.mode);
        if (payload.theme) setTheme(payload.theme);
        setLobbyEndsAt(payload.lobbyEndsAt || Date.now() + 30_000);
        phaseRef.current = GamePhase.LOBBY;
        setPhase(GamePhase.LOBBY);
      } else if (cmd === 'off') {
        phaseRef.current = GamePhase.OFF;
        setPhase(GamePhase.OFF);
      }
      return { ok: true, message: 'Command executed' };
    },
    onSnapshot: (snapshot) => {
      if (snapshot && phaseRef.current === GamePhase.PLAYING) {
        if (snapshot.snakes && Object.keys(snapshot.snakes).length > 0) {
          snakesRef.current = { ...snapshot.snakes, ...snakesRef.current };
          if (snapshot.foods) foodsRef.current = snapshot.foods;
          if (snapshot.bounds) boundsRef.current = snapshot.bounds;
        }
      }
    },
    onMoveIntent: (playerId, targetX, targetY) => {
      const sId = `snake-${playerId}`;
      const s = snakesRef.current[sId];
      if (s) {
        snakesRef.current[sId] = { ...s, target: { x: targetX, y: targetY } };
      }
    },
    getSnapshot: () => ({
      id: 'main',
      mode,
      theme,
      phase: phaseRef.current,
      startedAt: startedAtRef.current,
      endsAt: startedAtRef.current ? startedAtRef.current + 120_000 : null,
      bounds: boundsRef.current,
      snakes: snakesRef.current,
      foods: foodsRef.current,
      leaderboard: [],
      version: 1
    })
  });

  // Handle Mode Selection in Lobby
  const handleSelectMode = (newMode: ArenaMode, newTheme: Theme) => {
    setMode(newMode);
    setTheme(newTheme);
  };

  // Start Match with 3 head diameters starting snake for selected mode & theme
  const startMatch = useCallback((selectedMode?: ArenaMode, selectedTheme?: Theme) => {
    const activeMode = selectedMode || mode;
    const activeTheme = selectedTheme || theme;

    setMode(activeMode);
    setTheme(activeTheme);
    themeRef.current = activeTheme;

    const now = Date.now();
    const allSnakes: Record<string, SnakeState> = {};

    const mySnakeId = `snake-${player.id}`;
    allSnakes[mySnakeId] = createPlayerSnake(player);

    // Add 3 Active Bot Snakes
    INITIAL_BOTS.forEach((botDef, index) => {
      const botId = `snake-${botDef.id}`;
      const startX = (index + 1) * 200 * (index % 2 === 0 ? 1 : -1);
      const startY = (index + 1) * 150 * (index % 2 === 0 ? -1 : 1);
      const botPath = Array.from({ length: 9 }, (_, i) => ({ x: startX - i * 14, y: startY }));

      allSnakes[botId] = {
        id: botId,
        playerId: botDef.id,
        nickname: botDef.name,
        baseColor: botDef.color,
        head: { x: startX, y: startY },
        direction: { x: 1, y: 0 },
        target: { x: startX + 50, y: startY + 50 },
        bodyPath: botPath,
        bodySegments: Array.from({ length: 3 }, (_, i) => ({
          id: `bot-base-seg-${i}`,
          type: 'base',
          lengthUnits: 1,
          colorMode: 'player',
          color: botDef.color
        })),
        baseLength: 3,
        earnedLength: 0,
        totalLength: 3,
        currentSpeed: 180,
        heldFoods: [],
        buildState: { status: 'INVALID', candidates: [], sentenceCandidates: [], version: 1 },
        completionHistory: [],
        isBot: true,
        botLevel: index + 2,
        connected: true
      };
    });

    const initFoods = generateInitialFoods(Object.keys(allSnakes).length, INITIAL_BOUNDS);

    // Populate Physics Engine Refs Directly
    snakesRef.current = allSnakes;
    foodsRef.current = initFoods;
    boundsRef.current = INITIAL_BOUNDS;
    phaseRef.current = GamePhase.PLAYING;
    startedAtRef.current = now;

    // Trigger React State Updates
    setSnakes(allSnakes);
    setFoods(initFoods);
    setBounds(INITIAL_BOUNDS);
    setStartedAt(now);
    setPhase(GamePhase.PLAYING);
  }, [mode, theme, player, createPlayerSnake]);

  // Clean 60fps Game Loop using mutable refs
  useEffect(() => {
    if (phase !== GamePhase.PLAYING) return;
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

        if (remaining <= 0) {
          phaseRef.current = GamePhase.THEATER;
          setPhase(GamePhase.THEATER);
          audio.playVictory();
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

      // Ensure local player snake exists in game engine during PLAYING phase
      const mySnakeId = `snake-${player.id}`;
      if (!prevSnakes[mySnakeId]) {
        prevSnakes[mySnakeId] = createPlayerSnake(player);
      }

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

      // Check if ground food count dropped below threshold (playerCount * 8)
      const playerCount = Math.max(1, Object.keys(prevSnakes).length);
      const targetMin = playerCount * 8;
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
          const aiDecision = updateBotAI(snake, prevSnakes, updatedFoods, currentBounds);
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
      }

      // Update refs
      snakesRef.current = colRes.updatedSnakes;
      foodsRef.current = colRes.updatedFoods;

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [phase, player, createPlayerSnake]);

  // Sync React state periodically for Leaderboard & candidate HUD
  useEffect(() => {
    if (phase !== GamePhase.PLAYING) return;
    const interval = setInterval(() => {
      setSnakes({ ...snakesRef.current });
      setFoods({ ...foodsRef.current });
      setBounds({ ...boundsRef.current });
    }, 150); // 6.6fps UI sync

    return () => clearInterval(interval);
  }, [phase]);

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

  // Settle Word (WORD_READY)
  const handleSettleWord = (candidate: CandidateWord) => {
    const mySnakeId = `snake-${player.id}`;
    const mySnake = snakesRef.current[mySnakeId];
    if (!mySnake) return;

    const settled = settleWord(mySnake, candidate, foodsRef.current, boundsRef.current, themeRef.current);
    snakesRef.current = { ...snakesRef.current, [mySnakeId]: settled.updatedSnake };
    foodsRef.current = settled.updatedFoods;
    setSnakes({ ...snakesRef.current });
    setFoods({ ...foodsRef.current });
  };

  // Settle Sentence (SENTENCE_READY)
  const handleSettleSentence = (candidate: CandidateSentence) => {
    const mySnakeId = `snake-${player.id}`;
    const mySnake = snakesRef.current[mySnakeId];
    if (!mySnake) return;

    const settled = settleSentence(mySnake, candidate, foodsRef.current, boundsRef.current, themeRef.current);
    snakesRef.current = { ...snakesRef.current, [mySnakeId]: settled.updatedSnake };
    foodsRef.current = settled.updatedFoods;
    setSnakes({ ...snakesRef.current });
    setFoods({ ...foodsRef.current });
  };

  // Abandon / Spill Tail
  const handleSpillTail = () => {
    const mySnakeId = `snake-${player.id}`;
    const res = triggerSelfTailSpill(mySnakeId, snakesRef.current, foodsRef.current, boundsRef.current);
    snakesRef.current = res.updatedSnakes;
    foodsRef.current = res.updatedFoods;
    setSnakes({ ...snakesRef.current });
    setFoods({ ...foodsRef.current });
  };

  if (IS_REMOTE) {
    return <RemoteControl onCommand={async () => ({ ok: true, message: 'Executed' })} />;
  }

  const arenaState: ArenaState = {
    id: 'main',
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
      {phase === GamePhase.LOBBY && (
        <LobbyScreen
          player={player}
          players={[player, ...INITIAL_BOTS.map(b => ({ id: b.id, name: b.name, color: b.color, isBot: true }))]}
          selectedMode={mode}
          onSelectMode={handleSelectMode}
          onUpdatePlayer={handleUpdatePlayer}
          lang={lang}
          onSelectLanguage={setLang}
          lobbyEndsAt={lobbyEndsAt}
          onStart={(overrideMode, overrideTheme) => startMatch(overrideMode, overrideTheme)}
          t={(k) => translations[lang]?.[k] || k}
        />
      )}

      {phase === GamePhase.PLAYING && (
        <GameBoard
          player={player}
          snakes={snakesRef.current}
          foods={foodsRef.current}
          bounds={boundsRef.current}
          theme={theme}
          mode={mode}
          timeRemainingSeconds={timeRemaining}
          lang={lang}
          onSelectLanguage={setLang}
          onPointerTarget={handlePointerTarget}
          onSettleWord={handleSettleWord}
          onSettleSentence={handleSettleSentence}
          onSpillTail={handleSpillTail}
          t={(k) => translations[lang]?.[k] || k}
        />
      )}

      {phase === GamePhase.THEATER && (
        <TheaterScreen
          arenaState={arenaState}
          player={player}
          onRestart={() => {
            phaseRef.current = GamePhase.LOBBY;
            setPhase(GamePhase.LOBBY);
          }}
          t={(k) => translations[lang]?.[k] || k}
        />
      )}
    </div>
  );
};

export default App;
