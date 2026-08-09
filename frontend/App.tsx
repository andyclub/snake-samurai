import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArenaBounds, ArenaMode, ArenaState, CandidateSentence, CandidateWord, FoodState, GamePhase, Language, Player, SnakeState, Theme } from './types';
import { translations, getBrowserLanguage } from './i18n';
import GameBoard from './components/GameBoard';
import LobbyScreen from './components/LobbyScreen';
import TheaterScreen from './components/TheaterScreen';
import GameOffScreen from './components/GameOffScreen';
import { audio } from './audio';
import { useSnakeSamuraiMultiplayer } from './useSnakeSamuraiMultiplayer';
import { generateInitialFoods, generateSingleFood } from './game/foodGenerator';
import { updateSnakePosition } from './game/snakeMovement';
import { checkAndResolveCollisions, triggerSelfTailSpill } from './game/collisionEngine';
import { settleSentence, settleWord } from './game/settleManager';
import { updateBotAI } from './game/botAI';
import { searchCandidates } from './language/trieEngine';
import { analyzeSentenceBuilding } from './language/sentenceEngine';
import { callSnakeSamuraiControl, claimSnakeSamuraiStart, persistSnakeSamuraiSnapshot, SNAKE_SAMURAI_ROOM_ID, validateSnakeComposition } from './supabase';

const INITIAL_BOUNDS: ArenaBounds = { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
const ROOM_MODE: ArenaMode = SNAKE_SAMURAI_ROOM_ID === 'snake-disaster' ? 'disaster' : SNAKE_SAMURAI_ROOM_ID === 'snake-theme' ? 'random' : 'free';
const ROOM_THEME: Theme = SNAKE_SAMURAI_ROOM_ID === 'snake-disaster' ? 'disaster' : SNAKE_SAMURAI_ROOM_ID === 'snake-theme' ? 'travel' : 'free';
const KATAKANA = ['アオイ', 'カゼ', 'ソラ', 'ナギ', 'リン', 'ユキ', 'ハル', 'レイ', 'ミオ', 'ルイ'];
const randomKatakana = () => KATAKANA[Math.floor(Math.random() * KATAKANA.length)] + Math.floor(10 + Math.random() * 90);

const INITIAL_BOTS = [
  { id: 'bot-1', name: '侍カゼ (IQ25)', color: '#ef4444', level: 1 },
  { id: 'bot-2', name: '忍者ソラ (IQ50)', color: '#10b981', level: 2 },
  { id: 'bot-3', name: '武士ナギ (IQ75)', color: '#8b5cf6', level: 3 },
  { id: 'bot-4', name: '将軍リン (IQ100)', color: '#f59e0b', level: 4 }
];

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(getBrowserLanguage());
  const [phase, setPhase] = useState<GamePhase>(GamePhase.LOBBY);
  const [mode, setMode] = useState<ArenaMode>(ROOM_MODE);
  const [theme, setTheme] = useState<Theme>(ROOM_THEME);
  const [lobbyEndsAt, setLobbyEndsAt] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(120);
  const [bounds, setBounds] = useState<ArenaBounds>(INITIAL_BOUNDS);
  const [manualBots, setManualBots] = useState<Player[]>([]);
  const [themeAlert, setThemeAlert] = useState('');
  const [controlError, setControlError] = useState('');
  const [tailSpillEffect, setTailSpillEffect] = useState<{ victimId: string; at: number } | null>(null);

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
  const battleMusicRef = useRef<'BATTLE' | 'BLADE_BATTLE'>('BATTLE');
  const startAttemptForDeadlineRef = useRef<number | null>(null);
  const serverClockShiftRef = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
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
      // The three starting body segments are visual only; score begins at zero.
      baseLength: 0,
      earnedLength: 0,
      totalLength: 0,
      currentSpeed: 180,
      heldFoods: [],
      buildState: { status: 'INVALID', candidates: [], sentenceCandidates: [], version: 1 },
      completionHistory: [],
      isBot: false,
      connected: true
    };
  }, []);

  const applyCanonicalSnapshot = useCallback((snapshot: ArenaState, clockShift = 0) => {
    if (!snapshot?.snakes || Object.keys(snapshot.snakes).length === 0) return false;
    snakesRef.current = snapshot.snakes;
    foodsRef.current = snapshot.foods || {};
    boundsRef.current = snapshot.bounds || INITIAL_BOUNDS;
    setSnakes({ ...snapshot.snakes });
    setFoods({ ...(snapshot.foods || {}) });
    setBounds(snapshot.bounds || INITIAL_BOUNDS);
    if (snapshot.mode) setMode(snapshot.mode);
    if (snapshot.theme) {
      themeRef.current = snapshot.theme;
      setTheme(snapshot.theme);
    }
    if (typeof snapshot.startedAt === 'number') {
      serverClockShiftRef.current = clockShift;
      startedAtRef.current = snapshot.startedAt;
      setStartedAt(snapshot.startedAt);
    }
    setLobbyEndsAt(null);
    if (snapshot.phase === GamePhase.PLAYING || snapshot.phase === GamePhase.THEATER) {
      phaseRef.current = snapshot.phase;
      setPhase(snapshot.phase);
    }
    setControlError('');
    return true;
  }, []);

  // Multiplayer Hook
  const { userId, isHost, connection, registrationError, onlinePlayers, sendMoveIntent, broadcastSnapshot, broadcastTailSpill, requestSnapshot } = useSnakeSamuraiMultiplayer({
    roomId: SNAKE_SAMURAI_ROOM_ID,
    player,
    phaseRef,
    onCommand: async (cmd, payload) => {
      if (cmd === 'on' || cmd === 'restart') {
        if (payload.mode) setMode(payload.mode);
        if (payload.theme) setTheme(payload.theme);
        setLobbyEndsAt(typeof payload.lobbyEndsAt === 'number' ? payload.lobbyEndsAt : Date.now() + 25_000);
        setManualBots([]);
        phaseRef.current = GamePhase.LOBBY;
        setPhase(GamePhase.LOBBY);
      } else if (cmd === 'off') {
        audio.setBGM('OFF');
        phaseRef.current = GamePhase.OFF;
        setPhase(GamePhase.OFF);
      } else if (cmd === 'add_bot' && phaseRef.current === GamePhase.LOBBY && payload.bot?.id) {
        const bot = { ...payload.bot, isBot: true } as Player;
        setManualBots(previous => previous.some(item => item.id === bot.id) ? previous : [...previous, bot]);
      } else if (cmd === 'replay' && phaseRef.current === GamePhase.THEATER) {
        audio.setBGM('DEFEAT');
      }
      return { ok: true, message: 'Command executed' };
    },
    onSnapshot: applyCanonicalSnapshot,
    onMoveIntent: (playerId, targetX, targetY) => {
      const sId = `snake-${playerId}`;
      const s = snakesRef.current[sId];
      if (s) {
        snakesRef.current[sId] = { ...s, target: { x: targetX, y: targetY } };
      }
    },
    onTailSpill: (victimId) => setTailSpillEffect({ victimId, at: Date.now() }),
    getSnapshot: () => ({
      id: SNAKE_SAMURAI_ROOM_ID,
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

  useEffect(() => {
    if (userId && player.id !== userId) setPlayer(previous => ({ ...previous, id: userId }));
  }, [userId, player.id]);

  // Start Match with 3 head diameters starting snake for selected mode & theme
  const startMatch = useCallback(async (selectedMode?: ArenaMode, selectedTheme?: Theme) => {
    const activeMode = selectedMode || mode;
    const activeTheme = selectedTheme || theme;

    setMode(activeMode);
    setTheme(activeTheme);
    themeRef.current = activeTheme;

    const allSnakes: Record<string, SnakeState> = {};
    const humansById = new Map(onlinePlayers.filter(member => !member.isSpectator && !member.isBot).map(member => [member.id, member]));
    humansById.set(player.id, player);
    const humans = [...humansById.values()];
    const automaticBots: Player[] = humans.length === 1
      ? INITIAL_BOTS.slice(0, 3).map(bot => ({ id: bot.id, name: bot.name, color: bot.color, isBot: true, iq: bot.level }))
      : [];
    const entrants = [
      ...humans.map(member => ({ player: member, origin: undefined as 'automatic' | 'manual' | undefined })),
      ...automaticBots.map(member => ({ player: member, origin: 'automatic' as const })),
      ...manualBots.map(member => ({ player: member, origin: 'manual' as const })),
    ];

    entrants.forEach(({ player: entrant, origin }, index) => {
      const botId = `snake-${entrant.id}`;
      const startX = (index + 1) * 200 * (index % 2 === 0 ? 1 : -1);
      const startY = (index + 1) * 150 * (index % 2 === 0 ? -1 : 1);
      const snake = createPlayerSnake(entrant);
      allSnakes[botId] = {
        ...snake,
        id: botId, playerId: entrant.id, nickname: entrant.name, baseColor: entrant.color,
        head: { x: startX, y: startY },
        target: { x: startX + 50, y: startY + 50 },
        bodyPath: Array.from({ length: 9 }, (_, i) => ({ x: startX - i * 14, y: startY })),
        isBot: entrant.isBot,
        botLevel: entrant.isBot ? Math.max(1, Math.min(4, Math.round((entrant.iq || 50) / 25))) : undefined,
        botOrigin: origin,
      };
    });

    const initFoods = generateInitialFoods(Object.keys(allSnakes).length, INITIAL_BOUNDS, undefined, activeTheme);

    const proposedAt = Date.now();
    const proposedSnapshot: ArenaState = {
      id: SNAKE_SAMURAI_ROOM_ID, mode: activeMode, theme: activeTheme, phase: GamePhase.PLAYING,
      startedAt: proposedAt, endsAt: proposedAt + 120_000, bounds: INITIAL_BOUNDS,
      snakes: allSnakes, foods: initFoods, leaderboard: [], version: 1
    };
    const claim = await claimSnakeSamuraiStart(proposedSnapshot, SNAKE_SAMURAI_ROOM_ID);
    if (!claim.ok || !claim.snapshot?.snakes) {
      await requestSnapshot();
      return false;
    }
    const clockShift = claim.serverNow ? Date.now() - Date.parse(claim.serverNow) : 0;
    serverClockShiftRef.current = clockShift;
    const claimedSnapshot = claim.snapshot as ArenaState;
    const now = typeof claimedSnapshot.startedAt === 'number' ? claimedSnapshot.startedAt + clockShift : Date.now();
    const claimedSnakes = claimedSnapshot.snakes;
    const claimedFoods = claimedSnapshot.foods || initFoods;

    // Populate Physics Engine Refs Directly
    snakesRef.current = claimedSnakes;
    foodsRef.current = claimedFoods;
    boundsRef.current = INITIAL_BOUNDS;
    phaseRef.current = GamePhase.PLAYING;
    startedAtRef.current = now;

    // Trigger React State Updates
    setSnakes(claimedSnakes);
    setFoods(claimedFoods);
    setBounds(INITIAL_BOUNDS);
    setStartedAt(now);
    setPhase(GamePhase.PLAYING);
    broadcastSnapshot({
      id: SNAKE_SAMURAI_ROOM_ID, mode: activeMode, theme: activeTheme, phase: GamePhase.PLAYING,
      startedAt: now, endsAt: now + 120_000, bounds: INITIAL_BOUNDS,
      snakes: claimedSnakes, foods: claimedFoods, leaderboard: [], version: 1
    });
    audio.init();
    battleMusicRef.current = 'BATTLE';
    audio.setBGM('BATTLE');
    return true;
  }, [mode, theme, player, onlinePlayers, manualBots, createPlayerSnake, broadcastSnapshot, requestSnapshot]);

  // The shared Ransen remote is the sole way to open a round. Every snake
  // client follows the same cloud lobby deadline and starts locally together.
  useEffect(() => {
    if (phase !== GamePhase.LOBBY) return;
    let cancelled = false;
    const syncLobby = async () => {
      const control = await callSnakeSamuraiControl('GET');
      if (cancelled) return;
      if (!control.ok) {
        setControlError(control.message || '场次服务连接失败，正在重试');
        return;
      }
      setControlError('');
      if (control.phase === GamePhase.LOBBY && control.lobbyEndsAt) {
        const clockShift = control.serverNow ? Date.now() - Date.parse(control.serverNow) : 0;
        serverClockShiftRef.current = clockShift;
        const deadline = Date.parse(control.lobbyEndsAt) + clockShift;
        if (Number.isFinite(deadline)) setLobbyEndsAt(deadline);
      } else if ((control.phase === GamePhase.PLAYING || control.phase === GamePhase.THEATER) && control.snapshot?.snakes) {
        const clockShift = control.serverNow ? Date.now() - Date.parse(control.serverNow) : 0;
        applyCanonicalSnapshot({
          ...control.snapshot,
          phase: control.phase,
          startedAt: typeof control.snapshot.startedAt === 'number' ? control.snapshot.startedAt + clockShift : null,
          endsAt: typeof control.snapshot.endsAt === 'number' ? control.snapshot.endsAt + clockShift : null,
        } as ArenaState, clockShift);
      }
    };
    void syncLobby();
    const interval = window.setInterval(syncLobby, lobbyEndsAt && lobbyEndsAt - Date.now() < 8_000 ? 750 : 2_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [phase, lobbyEndsAt, applyCanonicalSnapshot]);

  useEffect(() => {
    if (phase !== GamePhase.LOBBY || !lobbyEndsAt) return;
    const tick = () => {
      if (Date.now() >= lobbyEndsAt && startAttemptForDeadlineRef.current !== lobbyEndsAt) {
        startAttemptForDeadlineRef.current = lobbyEndsAt;
        // The room director owns creation. Read its canonical snapshot directly;
        // Realtime is an acceleration path, never the only way into a match.
        void callSnakeSamuraiControl('GET').then(control => {
          if ((control.phase === GamePhase.PLAYING || control.phase === GamePhase.THEATER) && control.snapshot?.snakes) {
            const shift = control.serverNow ? Date.now() - Date.parse(control.serverNow) : 0;
            applyCanonicalSnapshot({ ...control.snapshot, phase: control.phase,
              startedAt: typeof control.snapshot.startedAt === 'number' ? control.snapshot.startedAt + shift : null,
              endsAt: typeof control.snapshot.endsAt === 'number' ? control.snapshot.endsAt + shift : null } as ArenaState, shift);
          } else {
            startAttemptForDeadlineRef.current = null;
          }
        });
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [phase, lobbyEndsAt, applyCanonicalSnapshot]);

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

  useEffect(() => {
    if (!isHost || phase !== GamePhase.PLAYING) return;
    const publish = () => broadcastSnapshot({
      id: SNAKE_SAMURAI_ROOM_ID, mode: mode, theme: themeRef.current, phase: GamePhase.PLAYING,
      startedAt: startedAtRef.current, endsAt: startedAtRef.current ? startedAtRef.current + 120_000 : null,
      bounds: boundsRef.current, snakes: snakesRef.current, foods: foodsRef.current, leaderboard: [], version: 1
    });
    publish();
    const timer = window.setInterval(publish, 120);
    return () => window.clearInterval(timer);
  }, [isHost, phase, mode, broadcastSnapshot]);

  useEffect(() => {
    if (!isHost || phase !== GamePhase.PLAYING) return;
    const persist = () => {
      const localStartedAt = startedAtRef.current;
      if (!localStartedAt) return;
      void persistSnakeSamuraiSnapshot({
        id: SNAKE_SAMURAI_ROOM_ID, mode, theme: themeRef.current, phase: GamePhase.PLAYING,
        startedAt: localStartedAt - serverClockShiftRef.current,
        endsAt: localStartedAt - serverClockShiftRef.current + 120_000,
        bounds: boundsRef.current, snakes: snakesRef.current, foods: foodsRef.current,
        leaderboard: [], version: 1,
      }, SNAKE_SAMURAI_ROOM_ID);
    };
    const timer = window.setInterval(persist, 3_000);
    return () => window.clearInterval(timer);
  }, [isHost, phase, mode]);

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
          void persistSnakeSamuraiSnapshot(finalSnapshot, SNAKE_SAMURAI_ROOM_ID);
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
  }, [phase, player, createPlayerSnake, isHost, mode, broadcastSnapshot, broadcastTailSpill]);

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

  // Settle Word (WORD_READY)
  const handleSettleWord = (candidate: CandidateWord) => {
    const mySnakeId = `snake-${player.id}`;
    const mySnake = snakesRef.current[mySnakeId];
    if (!mySnake) return;

    if (SNAKE_SAMURAI_ROOM_ID === 'snake-theme' && !candidate.themeMatch) {
      setThemeAlert(`当前主题：${translations[lang]?.[`theme.${themeRef.current}`] || themeRef.current}`);
      window.setTimeout(() => setThemeAlert(''), 1_500);
      const failed = triggerSelfTailSpill(mySnakeId, snakesRef.current, foodsRef.current, boundsRef.current);
      snakesRef.current = failed.updatedSnakes; foodsRef.current = failed.updatedFoods;
      setSnakes({ ...snakesRef.current }); setFoods({ ...foodsRef.current }); audio.playTailSpill();
      return;
    }
    if (SNAKE_SAMURAI_ROOM_ID === 'snake-disaster' && !candidate.id.startsWith('verified-')) {
      const surface = mySnake.heldFoods.map(item => item.glyph).join('');
      void validateSnakeComposition(surface, 'disaster', SNAKE_SAMURAI_ROOM_ID).then(validation => {
        if (validation.ok && validation.valid) handleSettleWord({ ...candidate, id: `verified-${Date.now()}`, canonical: validation.canonical || surface, themeMatch: true });
        else {
          const failed = triggerSelfTailSpill(mySnakeId, snakesRef.current, foodsRef.current, boundsRef.current);
          snakesRef.current = failed.updatedSnakes; foodsRef.current = failed.updatedFoods;
          setSnakes({ ...snakesRef.current }); setFoods({ ...foodsRef.current }); audio.playTailSpill();
        }
      });
      return;
    }

    const settled = settleWord(mySnake, candidate, foodsRef.current, boundsRef.current, themeRef.current);
    snakesRef.current = { ...snakesRef.current, [mySnakeId]: settled.updatedSnake };
    foodsRef.current = settled.updatedFoods;
    setSnakes({ ...snakesRef.current });
    setFoods({ ...foodsRef.current });
    audio.playWordCompleted();
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
    audio.playSentenceCompleted();
  };

  // Abandon / Spill Tail
  const spillOwnTail = () => {
    const mySnakeId = `snake-${player.id}`;
    const res = triggerSelfTailSpill(mySnakeId, snakesRef.current, foodsRef.current, boundsRef.current);
    snakesRef.current = res.updatedSnakes;
    foodsRef.current = res.updatedFoods;
    setSnakes({ ...snakesRef.current });
    setFoods({ ...foodsRef.current });
    broadcastTailSpill(mySnakeId);
  };

  const handleComposeHeldFoods = async () => {
    const mySnakeId = `snake-${player.id}`;
    const mySnake = snakesRef.current[mySnakeId];
    if (!mySnake || mySnake.heldFoods.length === 0) return;
    const sentence = analyzeSentenceBuilding(mySnake.heldFoods, themeRef.current).candidates[0];
    if (sentence) { handleSettleSentence(sentence); return; }
    const local = SNAKE_SAMURAI_ROOM_ID === 'snake-disaster' ? undefined : searchCandidates(mySnake.heldFoods, themeRef.current).candidates[0];
    if (local) { handleSettleWord(local); return; }
    if (mySnake.heldFoods.length < 3) { spillOwnTail(); audio.playTailSpill(); return; }
    const surface = mySnake.heldFoods.map(item => item.glyph).join('');
    const validation = await validateSnakeComposition(surface, themeRef.current, SNAKE_SAMURAI_ROOM_ID);
    if (validation.ok && validation.valid) {
      handleSettleWord({ id: `verified-${Date.now()}`, canonical: validation.canonical || surface, reading: validation.canonical || surface, readingLength: Array.from(surface).length, themeMatch: true });
      return;
    }
    if (validation.reason === 'theme_mismatch') {
      setThemeAlert(`当前主题：${translations[lang]?.[`theme.${themeRef.current}`] || themeRef.current}`);
      window.setTimeout(() => setThemeAlert(''), 1_500);
    }
    spillOwnTail();
    audio.playTailSpill();
  };

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
      {themeAlert && <div role="alert" className="fixed inset-0 z-[200] grid place-items-center overflow-hidden bg-red-950/55 backdrop-blur-sm animate-pulse">
        <div className="absolute inset-0 opacity-80" style={{background:'linear-gradient(31deg,transparent 46%,#fff 47%,transparent 48%),linear-gradient(147deg,transparent 45%,#fb7185 46%,transparent 47%),linear-gradient(72deg,transparent 52%,#fff 53%,transparent 54%)'}} />
        <div className="relative rounded-3xl border-4 border-red-200 bg-slate-950/90 px-8 py-6 text-center text-2xl font-black shadow-[0_0_80px_#ef4444]">⚡ 与本场主题不相关<br/><span className="mt-2 block text-base text-red-200">{themeAlert}</span></div>
      </div>}
      {phase === GamePhase.OFF && (
        <GameOffScreen t={(k) => translations[lang]?.[k] || k} arenaName="聴風・侍蛇" gameUrl="https://h.kazeabc.com" />
      )}
      {phase === GamePhase.LOBBY && (
        <LobbyScreen
          player={player}
          players={[...onlinePlayers, ...manualBots]}
          selectedMode={mode}
          selectedTheme={theme}
          onUpdatePlayer={handleUpdatePlayer}
          lang={lang}
          onSelectLanguage={setLang}
          lobbyEndsAt={lobbyEndsAt}
          connectionError={controlError || registrationError || (connection === 'error' ? '实时连接异常，正在重试' : '')}
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
          onSpillTail={() => { spillOwnTail(); audio.playTailSpill(); }}
          tailSpillEffect={tailSpillEffect}
          t={(k) => translations[lang]?.[k] || k}
        />
      )}

      {phase === GamePhase.THEATER && (
        <TheaterScreen
          arenaState={arenaState}
          player={player}
          onRestart={() => {
            setLobbyEndsAt(null);
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
