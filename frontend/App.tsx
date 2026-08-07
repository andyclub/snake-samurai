import React, { useState, useEffect, useCallback } from 'react';
import { ArenaBounds, ArenaMode, ArenaState, CandidateSentence, CandidateWord, FoodState, GamePhase, Language, Player, SnakeState, Theme } from './types';
import { translations, getBrowserLanguage } from './i18n';
import GameBoard from './components/GameBoard';
import LobbyScreen from './components/LobbyScreen';
import TheaterScreen from './components/TheaterScreen';
import RemoteControl from './components/RemoteControl';
import { audio } from './audio';
import { useRansenMultiplayer } from './useRansenMultiplayer';
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

  // Game State
  const [snakes, setSnakes] = useState<Record<string, SnakeState>>({});
  const [foods, setFoods] = useState<Record<string, FoodState>>({});

  const handleUpdatePlayer = (name: string, color: string) => {
    localStorage.setItem('kazeabc_name', name);
    localStorage.setItem('kazeabc_color', color);
    setPlayer(prev => ({ ...prev, name, color }));
  };

  // Multiplayer Hook
  const { isHost, sendMoveIntent, broadcastSnapshot } = useRansenMultiplayer({
    roomId: 'main',
    player,
    onCommand: async (cmd, payload) => {
      if (cmd === 'on') {
        setPhase(GamePhase.LOBBY);
        if (payload.mode) setMode(payload.mode);
        if (payload.theme) setTheme(payload.theme);
        setLobbyEndsAt(payload.lobbyEndsAt || Date.now() + 30_000);
      } else if (cmd === 'off') {
        setPhase(GamePhase.OFF);
      }
      return { ok: true, message: 'Command executed' };
    },
    onSnapshot: (snapshot) => {
      if (snapshot) {
        setPhase(snapshot.phase);
        setSnakes(snapshot.snakes || {});
        setFoods(snapshot.foods || {});
        setBounds(snapshot.bounds || INITIAL_BOUNDS);
        if (snapshot.startedAt) setStartedAt(snapshot.startedAt);
      }
    },
    onMoveIntent: (playerId, targetX, targetY) => {
      setSnakes(prev => {
        const sId = `snake-${playerId}`;
        const snake = prev[sId];
        if (!snake) return prev;
        return {
          ...prev,
          [sId]: { ...snake, target: { x: targetX, y: targetY } }
        };
      });
    },
    getSnapshot: () => ({
      id: 'main',
      mode,
      theme,
      phase,
      startedAt,
      endsAt: startedAt ? startedAt + 120_000 : null,
      bounds,
      snakes,
      foods,
      leaderboard: [],
      version: 1
    })
  });

  // Handle Mode Selection in Lobby
  const handleSelectMode = (newMode: ArenaMode, newTheme: Theme) => {
    setMode(newMode);
    setTheme(newTheme);
  };

  // Start Match with initial length & active bots
  const startMatch = useCallback(() => {
    const now = Date.now();
    const allSnakes: Record<string, SnakeState> = {};

    // Initial human snake with 24 body nodes (>7.5 head diameters)
    const mySnakeId = `snake-${player.id}`;
    const initialPath = Array.from({ length: 24 }, (_, i) => ({ x: -i * 14, y: 0 }));

    allSnakes[mySnakeId] = {
      id: mySnakeId,
      playerId: player.id,
      nickname: player.name,
      baseColor: player.color,
      head: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      target: { x: 100, y: 0 },
      bodyPath: initialPath,
      bodySegments: Array.from({ length: 8 }, (_, i) => ({
        id: `base-seg-${i}`,
        type: 'base',
        lengthUnits: 1,
        colorMode: 'player',
        color: player.color
      })),
      baseLength: 8,
      earnedLength: 0,
      totalLength: 8,
      currentSpeed: 180,
      heldFoods: [],
      buildState: { status: 'INVALID', candidates: [], sentenceCandidates: [], version: 1 },
      completionHistory: [],
      isBot: false,
      connected: true
    };

    // Add 3 Active Bot Snakes
    INITIAL_BOTS.forEach((botDef, index) => {
      const botId = `snake-${botDef.id}`;
      const startX = (index + 1) * 200 * (index % 2 === 0 ? 1 : -1);
      const startY = (index + 1) * 150 * (index % 2 === 0 ? -1 : 1);
      const botPath = Array.from({ length: 24 }, (_, i) => ({ x: startX - i * 14, y: startY }));

      allSnakes[botId] = {
        id: botId,
        playerId: botDef.id,
        nickname: botDef.name,
        baseColor: botDef.color,
        head: { x: startX, y: startY },
        direction: { x: 1, y: 0 },
        target: { x: startX + 50, y: startY + 50 },
        bodyPath: botPath,
        bodySegments: Array.from({ length: 8 }, (_, i) => ({
          id: `bot-base-seg-${i}`,
          type: 'base',
          lengthUnits: 1,
          colorMode: 'player',
          color: botDef.color
        })),
        baseLength: 8,
        earnedLength: 0,
        totalLength: 8,
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

    setSnakes(allSnakes);
    setFoods(initFoods);
    setBounds(INITIAL_BOUNDS);
    setStartedAt(now);
    setPhase(GamePhase.PLAYING);
  }, [player, snakes]);

  // Main 60fps Game Loop
  useEffect(() => {
    if (phase !== GamePhase.PLAYING) return;
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const deltaSeconds = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      // 1. Update 120s match timer & Half Speed Boundary Shrinking
      let currentBounds = bounds;
      if (startedAt) {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const remaining = Math.max(0, 120 - elapsed);
        setTimeRemaining(remaining);

        if (remaining <= 0) {
          setPhase(GamePhase.THEATER);
          audio.playVictory();
          return;
        }

        // Half shrink speed: shrinks from 1000 to 800 over 120s (half of original 400 delta)
        const shrinkFactor = elapsed / 240;
        const currentSize = 1000 - shrinkFactor * 200;
        currentBounds = { minX: -currentSize, maxX: currentSize, minY: -currentSize, maxY: currentSize };
        setBounds(currentBounds);
      }

      // 2. Respawn foods that fall outside shrink bounds
      setFoods(prevFoods => {
        const nextFoods = { ...prevFoods };
        let modified = false;

        for (const fId of Object.keys(nextFoods)) {
          const food = nextFoods[fId];
          if (food.state !== 'ground') continue;

          if (
            food.x < currentBounds.minX || food.x > currentBounds.maxX ||
            food.y < currentBounds.minY || food.y > currentBounds.maxY
          ) {
            nextFoods[fId] = generateSingleFood(fId, currentBounds);
            modified = true;
          }
        }
        return modified ? nextFoods : prevFoods;
      });

      // 3. Update snake physics & Bot AI participation
      setSnakes(prevSnakes => {
        const updated: Record<string, SnakeState> = {};
        for (const sId of Object.keys(prevSnakes)) {
          let snake = prevSnakes[sId];

          // Bot AI Active Participation
          if (snake.isBot) {
            const aiDecision = updateBotAI(snake, prevSnakes, foods, currentBounds);
            snake = { ...snake, target: aiDecision.target };

            // Auto-settle for Bot
            if (aiDecision.shouldSettleSentenceIndex !== undefined && snake.buildState.sentenceCandidates[0]) {
              const res = settleSentence(snake, snake.buildState.sentenceCandidates[0], foods, currentBounds, theme);
              snake = res.updatedSnake;
              setFoods(res.updatedFoods);
            } else if (aiDecision.shouldSettleWordIndex !== undefined && snake.buildState.candidates[0]) {
              const res = settleWord(snake, snake.buildState.candidates[0], foods, currentBounds, theme);
              snake = res.updatedSnake;
              setFoods(res.updatedFoods);
            }
          }

          const movedSnake = updateSnakePosition(snake, deltaSeconds, currentBounds, prevSnakes);

          // Update buildState for held foods
          const wordSearch = searchCandidates(movedSnake.heldFoods, theme);
          const sentenceAnalysis = analyzeSentenceBuilding(movedSnake.heldFoods, theme);

          let buildStatus = wordSearch.status;
          if (sentenceAnalysis.isSentenceReady) {
            buildStatus = 'SENTENCE_READY';
          } else if (sentenceAnalysis.isSentenceBuilding) {
            buildStatus = 'SENTENCE_BUILDING';
          }

          updated[sId] = {
            ...movedSnake,
            buildState: {
              status: buildStatus,
              candidates: wordSearch.candidates,
              sentenceCandidates: sentenceAnalysis.candidates,
              version: (movedSnake.buildState.version || 0) + 1
            }
          };
        }
        return updated;
      });

      // 4. Resolve collisions
      setSnakes(prevSnakes => {
        const colRes = checkAndResolveCollisions(prevSnakes, foods, currentBounds);
        setFoods(colRes.updatedFoods);

        if (colRes.events.spills.length > 0) {
          audio.playTailSpill();
        }
        return colRes.updatedSnakes;
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [phase, startedAt, foods, bounds, theme]);

  // Pointer target input
  const handlePointerTarget = (x: number, y: number) => {
    sendMoveIntent(x, y);
    const mySnakeId = `snake-${player.id}`;
    setSnakes(prev => {
      const s = prev[mySnakeId];
      if (!s) return prev;
      return { ...prev, [mySnakeId]: { ...s, target: { x, y } } };
    });
  };

  // Settle Word (WORD_READY)
  const handleSettleWord = (candidate: CandidateWord) => {
    const mySnakeId = `snake-${player.id}`;
    const mySnake = snakes[mySnakeId];
    if (!mySnake) return;

    const settled = settleWord(mySnake, candidate, foods, bounds, theme);
    setSnakes(prev => ({ ...prev, [mySnakeId]: settled.updatedSnake }));
    setFoods(settled.updatedFoods);
  };

  // Settle Sentence (SENTENCE_READY)
  const handleSettleSentence = (candidate: CandidateSentence) => {
    const mySnakeId = `snake-${player.id}`;
    const mySnake = snakes[mySnakeId];
    if (!mySnake) return;

    const settled = settleSentence(mySnake, candidate, foods, bounds, theme);
    setSnakes(prev => ({ ...prev, [mySnakeId]: settled.updatedSnake }));
    setFoods(settled.updatedFoods);
  };

  // Abandon / Spill Tail
  const handleSpillTail = () => {
    const mySnakeId = `snake-${player.id}`;
    const res = triggerSelfTailSpill(mySnakeId, snakes, foods, bounds);
    setSnakes(res.updatedSnakes);
    setFoods(res.updatedFoods);
  };

  if (IS_REMOTE) {
    return <RemoteControl onCommand={async (cmd, payload) => ({ ok: true, message: 'Executed' })} />;
  }

  const arenaState: ArenaState = {
    id: 'main',
    mode,
    theme,
    phase,
    startedAt,
    endsAt: startedAt ? startedAt + 120_000 : null,
    bounds,
    snakes,
    foods,
    leaderboard: [],
    version: 1
  };

  return (
    <div className="w-screen h-screen bg-slate-950 text-white font-sans overflow-hidden">
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
          onStart={startMatch}
          t={(k) => translations[lang]?.[k] || k}
        />
      )}

      {phase === GamePhase.PLAYING && (
        <GameBoard
          player={player}
          snakes={snakes}
          foods={foods}
          bounds={bounds}
          theme={theme}
          mode={mode}
          timeRemainingSeconds={timeRemaining}
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
          onRestart={() => setPhase(GamePhase.LOBBY)}
          t={(k) => translations[lang]?.[k] || k}
        />
      )}
    </div>
  );
};

export default App;
