import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GamePhase, Language, Player, Slime, Encounter } from './types';
import { translations, getBrowserLanguage } from './i18n';
import { Globe, Terminal, HelpCircle, X, UserPlus } from 'lucide-react';
import GameOffScreen from './components/GameOffScreen';
import LobbyScreen from './components/LobbyScreen';
import GameBoard from './components/GameBoard';
import TheaterScreen from './components/TheaterScreen';
import { audio } from './audio';
import RemoteControl from './components/RemoteControl';
import FaqModal from './components/FaqModal';
import { useRansenMultiplayer } from './useRansenMultiplayer';
import { callRansenControl, claimRansenStart, persistRansenSnapshot } from './supabase';

const ARENA_ID = new URLSearchParams(window.location.search).get('arena') === 'bousai-toyama' ? 'bousai-toyama' : 'main';
const GAME_URL = ARENA_ID === 'bousai-toyama' ? 'https://g.kazeabc.com/?arena=bousai-toyama' : 'https://g.kazeabc.com';
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(GAME_URL)}`;
const KATAKANA = ['アオイ','カゼ','ソラ','ナギ','リン','ユキ','ハル','レイ','ミオ','ルイ'];
const randomKatakana = () => KATAKANA[Math.floor(Math.random() * KATAKANA.length)] + Math.floor(10 + Math.random() * 90);

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(getBrowserLanguage());
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [phase, setPhase] = useState<GamePhase>(GamePhase.OFF);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCmd, setAdminCmd] = useState('');
  
  // Player State with LocalStorage Memory
  const [player, setPlayer] = useState<Player>(() => {
    const savedName = localStorage.getItem('kazeabc_name');
    const savedColor = localStorage.getItem('kazeabc_color');
    const savedSpectator = localStorage.getItem('kazeabc_spectator') === 'true';
    return {
      id: `p-${Date.now()}`,
      name: savedName || randomKatakana(),
      color: savedColor || '#3b82f6',
      isBot: false,
      isSpectator: savedSpectator
    };
  });

  // Game State
  const [slimes, setSlimes] = useState<Slime[]>([]);
  const authoritativeSlimesRef = useRef<Slime[]>(slimes);
  const updateSlimes = useCallback<React.Dispatch<React.SetStateAction<Slime[]>>>((action) => {
    const next = typeof action === 'function'
      ? (action as (previous: Slime[]) => Slime[])(authoritativeSlimesRef.current)
      : action;
    authoritativeSlimesRef.current = next;
    setSlimes(next);
  }, []);
  const [encounters, setEncountersState] = useState<Encounter[]>([]);
  const authoritativeEncountersRef = useRef<Encounter[]>(encounters);
  const updateEncounters = useCallback<React.Dispatch<React.SetStateAction<Encounter[]>>>((action) => {
    const next = typeof action === 'function'
      ? (action as (previous: Encounter[]) => Encounter[])(authoritativeEncountersRef.current)
      : action;
    authoritativeEncountersRef.current = next;
    setEncountersState(next);
  }, []);
  const [isSpectator, setIsSpectator] = useState(() => Boolean(player.isSpectator));
  const [lobbyBots, setLobbyBots] = useState<Player[]>([]);
  const [gameStartedAt, setGameStartedAt] = useState<number | null>(null);
  const [lobbyEndsAt, setLobbyEndsAt] = useState<number | null>(null);
  const [arenaName, setArenaName] = useState('海老');

  const langMenuRef = useRef<HTMLDivElement>(null);
  const persistentSnapshotRef = useRef({ slimes, encounters, startedAt: gameStartedAt });
  persistentSnapshotRef.current = { slimes, encounters, startedAt: gameStartedAt };

  const t = useCallback((key: string) => translations[lang][key] || key, [lang]);

  // Initialize Audio on first interaction
  useEffect(() => {
    const initAudio = () => audio.init();
    document.addEventListener('pointerdown', initAudio, { passive: true });
    document.addEventListener('touchend', initAudio, { passive: true });
    document.addEventListener('keydown', initAudio);
    const resumeAfterVisibility = () => { if (!document.hidden) audio.init(); };
    document.addEventListener('visibilitychange', resumeAfterVisibility);
    return () => {
      document.removeEventListener('pointerdown', initAudio);
      document.removeEventListener('touchend', initAudio);
      document.removeEventListener('keydown', initAudio);
      document.removeEventListener('visibilitychange', resumeAfterVisibility);
    };
  }, []);

  // Handle BGM changes
  useEffect(() => {
    // Playing and theater choose finer-grained scenes inside their screens.
    if (phase === GamePhase.OFF || phase === GamePhase.LOBBY) audio.setBGM(phase);
  }, [phase]);

  const executeCommand = useCallback((cmd: string, broadcast = true, payload: Record<string, any> = {}) => {
    const normalized = cmd.replace('/jec.', '');
    if (broadcast) {
      localStorage.setItem('kazeabc_control', JSON.stringify({ command: normalized, at: Date.now() }));
      new BroadcastChannel('kazeabc-control').postMessage(normalized);
    }
    switch (normalized) {
      case 'on':
        if (phase !== GamePhase.OFF && phase !== GamePhase.THEATER) return { ok: false, message: '游戏已经开启' };
        setPhase(prev => {
          if (prev === GamePhase.OFF || prev === GamePhase.THEATER) {
            setLobbyBots([]);
            setLobbyEndsAt(typeof payload.lobbyEndsAt === 'number' ? payload.lobbyEndsAt : payload.serverState ? Date.now() : Date.now() + 30_000);
            if (payload.arenaName) setArenaName(String(payload.arenaName));
            return GamePhase.LOBBY;
          }
          return prev;
        });
        return { ok: true, message: '游戏已开启，进入招募倒计时' };
      case 'off':
        if (phase === GamePhase.OFF) return { ok: false, message: '游戏已经是关闭状态' };
        setPhase(GamePhase.OFF);
        updateSlimes([]);
        updateEncounters([]);
        setLobbyBots([]);
        setGameStartedAt(null);
        setLobbyEndsAt(null);
        return { ok: true, message: '游戏已关闭' };
      case 'restart':
        setPhase(GamePhase.LOBBY);
        updateSlimes([]);
        updateEncounters([]);
        setLobbyBots([]);
        setGameStartedAt(null);
        setLobbyEndsAt(typeof payload.lobbyEndsAt === 'number' ? payload.lobbyEndsAt : payload.serverState ? Date.now() : Date.now() + 30_000);
        if (payload.arenaName) setArenaName(String(payload.arenaName));
        return { ok: true, message: '当前游戏已重开，进入招募倒计时' };
      case 'add_bot':
        if (phase === GamePhase.LOBBY && payload.bot?.id) {
          setLobbyBots(prev => prev.some(bot => bot.id === payload.bot.id) ? prev : [...prev, payload.bot as Player]);
          audio.playAlert();
          return { ok: true, message: `机器人 ${payload.bot.name}（IQ ${payload.bot.iq}）已加入` };
        }
        return { ok: false, message: '仅可在开场倒计时期间增加机器人' };
      case 'replay':
        if (phase === GamePhase.THEATER) { audio.playVictory(); window.dispatchEvent(new CustomEvent('kazeabc-replay')); return { ok: true, message: '比赛结果已重新播报' }; }
        return { ok: false, message: '当前没有可重新播报的比赛结果' };
      default:
        return { ok: false, message: '无法识别该操作' };
    }
  }, [phase, updateEncounters, updateSlimes]);

  const applyRemoteInput = useCallback((playerId: string, x: number, y: number) => {
    updateSlimes(prev => prev.map(s => s.members.some(m => m.id === playerId) ? {
      ...s,
      targetX: x,
      targetY: y,
      memberTargets: { ...(s.memberTargets || {}), [playerId]: { x, y, at: Date.now() } },
    } : s));
  }, [updateSlimes]);
  const applyRemoteVote = useCallback((playerId: string, encounterId: string, option: number, receivedAt = Date.now()) => {
    updateEncounters(prev => prev.map(item => {
      if (item.id !== encounterId) return item;
      const team1 = authoritativeSlimesRef.current.find(s => s.id === item.slime1Id)?.members.some(m => m.id === playerId)
        || item.participants1?.some(member => member.id === playerId);
      return team1
        ? { ...item, votes1: { ...item.votes1, [playerId]: option }, voteTimes1: { ...item.voteTimes1, [playerId]: receivedAt } }
        : { ...item, votes2: { ...item.votes2, [playerId]: option }, voteTimes2: { ...item.voteTimes2, [playerId]: receivedAt } };
    }));
  }, [updateEncounters]);
  const multiplayer = useRansenMultiplayer({
    roomId: ARENA_ID,
    player,
    onCommand: (command, payload) => executeCommand(command, false, payload),
    onSnapshot: snapshot => {
      // A previous host can briefly keep broadcasting an old PLAYING/THEATER
      // snapshot after a new lobby was persisted. Never let that stale round
      // cancel the new 30-second recruitment window or cause instant game-over.
      if (phase === GamePhase.LOBBY) {
        if (snapshot.phase === GamePhase.THEATER) return;
        if (snapshot.phase === GamePhase.PLAYING && (
          !snapshot.startedAt || (lobbyEndsAt !== null && snapshot.startedAt < lobbyEndsAt - 2_000)
        )) return;
      }
      setPhase(snapshot.phase);
      updateSlimes(snapshot.slimes || []);
      updateEncounters(snapshot.encounters || []);
      setGameStartedAt(snapshot.startedAt || null);
      setLobbyEndsAt(previous => snapshot.phase === GamePhase.LOBBY ? (snapshot.lobbyEndsAt ?? previous) : null);
      if (snapshot.arenaName) setArenaName(snapshot.arenaName);
    },
    onInput: applyRemoteInput,
    onVote: applyRemoteVote,
    getSnapshot: () => ({ phase, slimes: authoritativeSlimesRef.current, encounters: authoritativeEncountersRef.current, startedAt: gameStartedAt, lobbyEndsAt, arenaName }),
  });
  const canonicalPlayerId = multiplayer.userId || player.id;

  useEffect(() => {
    if (multiplayer.userId && player.id !== multiplayer.userId) setPlayer(prev => ({ ...prev, id: multiplayer.userId! }));
  }, [multiplayer.userId, player.id]);

  useEffect(() => {
    if (phase !== GamePhase.PLAYING) return;
    const isInMatch = slimes.some(slime => !slime.isDead && slime.members.some(member => member.id === canonicalPlayerId));
    if (!isInMatch) {
      setIsSpectator(true);
      setPlayer(prev => prev.isSpectator ? prev : ({ ...prev, isSpectator: true }));
    }
  }, [canonicalPlayerId, phase, slimes]);

  useEffect(() => {
    localStorage.setItem('kazeabc_spectator', String(Boolean(player.isSpectator)));
    setIsSpectator(Boolean(player.isSpectator));
  }, [player.isSpectator]);

  useEffect(() => {
    if (!multiplayer.isHost) return;
    const timer = setInterval(() => multiplayer.publishSnapshot({
      phase,
      slimes: authoritativeSlimesRef.current,
      encounters: authoritativeEncountersRef.current,
      startedAt: gameStartedAt,
      lobbyEndsAt,
      arenaName,
    }), phase === GamePhase.PLAYING ? 500 : 750);
    return () => clearInterval(timer);
  }, [multiplayer.isHost, multiplayer.publishSnapshot, phase, gameStartedAt, lobbyEndsAt, arenaName]);

  // Encounter transitions are latency-critical. Publish and persist them
  // immediately instead of waiting for the 500 ms broadcast / 2 s DB timers.
  useEffect(() => {
    if (!multiplayer.isHost || phase !== GamePhase.PLAYING || !gameStartedAt) return;
    const snapshot = {
      phase,
      slimes: authoritativeSlimesRef.current,
      encounters: authoritativeEncountersRef.current,
      startedAt: gameStartedAt,
      lobbyEndsAt: null,
      arenaName,
    };
    multiplayer.publishSnapshot(snapshot);
    if (snapshot.slimes.length > 0) persistRansenSnapshot(snapshot, ARENA_ID).catch(error => console.error('Failed to persist encounter transition', error));
  }, [arenaName, encounters, gameStartedAt, multiplayer.isHost, multiplayer.publishSnapshot, phase]);

  useEffect(() => {
    if (!multiplayer.isHost || phase !== GamePhase.PLAYING || !gameStartedAt) return;
    const save = () => {
      const snapshot = {
        ...persistentSnapshotRef.current,
        slimes: authoritativeSlimesRef.current,
        encounters: authoritativeEncountersRef.current,
      };
      if (snapshot.slimes.length > 0) persistRansenSnapshot(snapshot, ARENA_ID).catch(error => console.error('Failed to persist game snapshot', error));
    };
    save();
    const timer = window.setInterval(save, 2000);
    return () => window.clearInterval(timer);
  }, [multiplayer.isHost, phase, gameStartedAt]);

  // Realtime Broadcast is deliberately low-latency but ephemeral. A client
  // that reconnects or misses a packet recovers active encounters from the
  // persisted room snapshot without rolling movement positions backwards.
  useEffect(() => {
    if (phase !== GamePhase.PLAYING || !gameStartedAt) return;
    let cancelled = false;
    let inFlight = false;
    const recoverEncounters = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const control = await callRansenControl('GET', undefined, ARENA_ID);
        if (cancelled || !control.ok || control.phase !== GamePhase.PLAYING) return;
        const stored = control.snapshot || {};
        const storedStartedAt = typeof stored.startedAt === 'number' ? stored.startedAt : null;
        if (!storedStartedAt || Math.abs(storedStartedAt - gameStartedAt) > 15_000) return;
        const shift = gameStartedAt - storedStartedAt;
        const incoming = (Array.isArray(stored.encounters) ? stored.encounters : []).map((encounter: Encounter) => ({
          ...encounter,
          startTime: encounter.startTime + shift,
          result: encounter.result?.resolvedAt ? { ...encounter.result, resolvedAt: encounter.result.resolvedAt + shift } : encounter.result,
        }));
        if (!incoming.length) return;
        updateEncounters(current => {
          let changed = false;
          const next = [...current];
          incoming.forEach((recovered: Encounter) => {
            const index = next.findIndex(item => item.id === recovered.id);
            if (index === -1) {
              next.push(recovered);
              changed = true;
              return;
            }
            const local = next[index];
            const votes1 = { ...recovered.votes1, ...local.votes1 };
            const votes2 = { ...recovered.votes2, ...local.votes2 };
            if (Object.keys(votes1).length !== Object.keys(local.votes1).length || Object.keys(votes2).length !== Object.keys(local.votes2).length) {
              next[index] = { ...recovered, ...local, votes1, votes2 };
              changed = true;
            }
          });
          return changed ? next : current;
        });
      } catch (error) {
        console.error('Encounter recovery failed', error);
      } finally {
        inFlight = false;
      }
    };
    const initial = window.setTimeout(recoverEncounters, 350);
    const timer = window.setInterval(recoverEncounters, 1200);
    return () => { cancelled = true; window.clearTimeout(initial); window.clearInterval(timer); };
  }, [gameStartedAt, phase, updateEncounters]);

  useEffect(() => {
    const channel = new BroadcastChannel('kazeabc-control');
    channel.onmessage = event => executeCommand(String(event.data), false);
    const storage = (event: StorageEvent) => {
      if (event.key === 'kazeabc_control' && event.newValue) executeCommand(JSON.parse(event.newValue).command, false);
    };
    window.addEventListener('storage', storage);
    return () => { channel.close(); window.removeEventListener('storage', storage); };
  }, [executeCommand]);

  // Secret Admin Entrance Check & Hash Commands
  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash === '#/jec.on') {
        setIsAdmin(true);
      } else if (hash === '#/jec.off' && isAdmin) {
        executeCommand('/jec.off');
        window.location.hash = '#/jec.on';
      } else if (hash === '#/jec.restart' && isAdmin) {
        executeCommand('/jec.restart');
        window.location.hash = '#/jec.on';
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [isAdmin, executeCommand]);

  // Close lang menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleJoinGame = (updatedPlayer: Player) => {
    setPlayer(updatedPlayer);
    localStorage.setItem('kazeabc_name', updatedPlayer.name);
    localStorage.setItem('kazeabc_color', updatedPlayer.color);
    localStorage.setItem('kazeabc_spectator', String(Boolean(updatedPlayer.isSpectator)));
  };

  const handleStartGame = async (initialSlimes: Slime[]) => {
    if (initialSlimes.length === 0) {
      console.error('Blocked invalid game start without slimes');
      return false;
    }
    const proposedStartedAt = Date.now();
    const proposedSnapshot = { phase: GamePhase.PLAYING, slimes: initialSlimes, encounters: [], startedAt: proposedStartedAt, lobbyEndsAt: null, arenaName };
    const claim = await claimRansenStart(proposedSnapshot, ARENA_ID);
    if (!claim.ok) {
      await multiplayer.requestSnapshot();
      return false;
    }
    const startedAt = Date.now();
    const claimedSlimes = Array.isArray(claim.snapshot?.slimes) ? claim.snapshot.slimes as Slime[] : initialSlimes;
    const snapshot = { ...proposedSnapshot, slimes: claimedSlimes, startedAt };
    updateSlimes(claimedSlimes);
    setGameStartedAt(startedAt);
    setPhase(GamePhase.PLAYING);
    setLobbyEndsAt(null);
    // Do not wait for the periodic publisher: announce the transition immediately.
    multiplayer.publishSnapshot(snapshot);
    return true;
  };

  const handleGameOver = useCallback(() => {
    setPhase(GamePhase.THEATER);
    const snapshot = persistentSnapshotRef.current;
    persistRansenSnapshot({ ...snapshot, phase: GamePhase.THEATER }, ARENA_ID).catch(error => console.error('Failed to persist game over', error));
  }, []);

  const handleJoinNextRound = useCallback(async () => {
    // Clicking "join" is an explicit opt-in. Clear a previously persisted
    // spectator choice before Presence is refreshed for the next lobby.
    localStorage.setItem('kazeabc_spectator', 'false');
    setIsSpectator(false);
    setPlayer(previous => ({ ...previous, isSpectator: false }));
    return multiplayer.startPublicGame();
  }, [multiplayer.startPublicGame]);

  const languages: { code: Language; label: string }[] = [
    { code: 'zh-CN', label: '简体中文' },
    { code: 'ja', label: '日本語' },
    { code: 'en', label: 'English' },
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'ko', label: '한국어' },
    { code: 'fr', label: 'Français' },
    { code: 'nl', label: 'Nederlands' }
  ];

  const currentRoundPlayerIds = new Set(
    slimes.flatMap(slime => slime.members)
      .filter(member => !member.isBot && !member.isSpectator)
      .map(member => member.id)
  );
  const currentGamePlayerCount = phase === GamePhase.PLAYING || phase === GamePhase.THEATER
    ? currentRoundPlayerIds.size
    : phase === GamePhase.LOBBY
      ? multiplayer.onlinePlayers.filter(member => !member.isSpectator).length
      : 0;

  if (window.location.pathname.replace(/\/$/, '') === '/r') return (
    <RemoteControl
      onCommand={multiplayer.sendCommand}
      connection={multiplayer.connection}
      phase={phase}
      playerCount={currentGamePlayerCount}
      onlineCount={multiplayer.onlinePlayers.length}
    />
  );

  return (
    <div className="relative w-full max-w-full h-full overflow-hidden overscroll-none font-sans">
      {/* Secret Admin Console */}
      {isAdmin && (
        <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-2">
          <div className="text-xs text-slate-400 bg-black/80 p-3 rounded-lg border border-slate-700 text-left backdrop-blur-md shadow-xl">
            <p className="text-emerald-400 font-bold mb-1 flex items-center gap-1"><Terminal className="w-3 h-3"/> Admin Console</p>
            <p className="hover:text-white cursor-pointer" onClick={() => setAdminCmd('/jec.on')}>/jec.on - 开启游戏</p>
            <p className="hover:text-white cursor-pointer" onClick={() => setAdminCmd('/jec.off')}>/jec.off - 强制停止</p>
            <p className="hover:text-white cursor-pointer" onClick={() => setAdminCmd('/jec.restart')}>/jec.restart - 强制重开</p>
          </div>
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              executeCommand(adminCmd); 
              setAdminCmd(''); 
            }}
            className="flex gap-2 bg-black/90 p-2 rounded-lg border border-emerald-500/50 backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.2)]"
          >
            <span className="text-emerald-400 font-mono py-1 pl-2">{'>'}</span>
            <input 
              type="text" 
              value={adminCmd}
              onChange={e => setAdminCmd(e.target.value)}
              placeholder="输入命令..."
              className="bg-transparent text-white font-mono outline-none w-48"
            />
          </form>
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <FaqModal onClose={() => setShowRules(false)} lang={lang} />
        /*<div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-emerald-400">{t('rules.title')}</h2>
              <button 
                onClick={() => { audio.playPop(); setShowRules(false); }} 
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-3 text-slate-200 text-sm leading-relaxed">
              <p>{t('rules.1')}</p>
              <p>{t('rules.2')}</p>
              <p>{t('rules.3')}</p>
              <p>{t('rules.4')}</p>
              <p>{t('rules.5')}</p>
            </div>
            <button 
              onClick={() => { audio.playPop(); setShowRules(false); }}
              className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-colors"
            >
              {t('rules.close')}
            </button>
          </div>
        </div>*/
      )}

      {showQr && <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-lg flex items-center justify-center p-6" onClick={() => setShowQr(false)}><div className="bg-white rounded-3xl p-5 max-w-sm w-full text-center text-slate-900 shadow-2xl" onClick={e=>e.stopPropagation()}><img src={QR_URL} className="w-full rounded-xl" alt={t('qr.game')}/><p className="font-black text-xl mt-4">{t('qr.game')}</p><p className="text-slate-500">g.kazeabc.com</p><button className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-full" onClick={()=>setShowQr(false)}>{t('btn.close')}</button></div></div>}

      {/* Main Routing */}
      {phase === GamePhase.OFF && <GameOffScreen t={t} arenaName={arenaName} gameUrl={GAME_URL} />}
      
      {phase === GamePhase.LOBBY && (
        <LobbyScreen 
          t={t} 
          player={{ ...player, id: canonicalPlayerId }}
          onUpdatePlayer={handleJoinGame}
          onStart={handleStartGame}
          setIsSpectator={setIsSpectator}
          isHost={multiplayer.isHost}
          onlinePlayers={multiplayer.onlinePlayers}
          extraBots={lobbyBots}
          onShowQr={() => { audio.playPop(); setShowQr(true); }}
          endsAt={lobbyEndsAt}
          arenaName={arenaName}
          onSyncNeeded={multiplayer.requestSnapshot}
          roomId={ARENA_ID}
        />
      )}

      {phase === GamePhase.PLAYING && (
        <GameBoard 
          t={t}
          player={{ ...player, id: canonicalPlayerId }}
          isSpectator={isSpectator}
          slimes={slimes}
          setSlimes={updateSlimes}
          slimesRef={authoritativeSlimesRef}
          encounters={encounters}
          setEncounters={updateEncounters}
          encountersRef={authoritativeEncountersRef}
          onGameOver={handleGameOver}
          isHost={multiplayer.isHost}
          onMove={(x, y) => { multiplayer.sendInput(x, y); }}
          onVote={(encounterId, option) => { multiplayer.sendVote(encounterId, option); }}
          startedAt={gameStartedAt || Date.now()}
          questionLevels={ARENA_ID === 'bousai-toyama' ? ['防災', '富山'] : undefined}
        />
      )}

      {phase === GamePhase.THEATER && (
        <TheaterScreen 
          t={t} 
          slimes={slimes} 
          player={{ ...player, id: canonicalPlayerId }}
          onRestart={handleJoinNextRound}
        />
      )}

      {/* Custom Language Selector, Help & Version Info (Bottom Right) */}
      <div className="absolute bottom-6 right-6 z-50 flex items-center gap-3" ref={langMenuRef}>
        <span className={`w-2.5 h-2.5 rounded-full ${multiplayer.connection === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : multiplayer.connection === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse'}`} title={`Realtime: ${multiplayer.connection}`} />
        <div className="flex flex-col items-end text-xs text-slate-500/80 font-mono select-none pointer-events-none">
          <span>v{__REPO_COMMIT_COUNT__}</span>
          <span>2026-07-15</span>
        </div>
        
        <button 
          onClick={() => {
            audio.playPop();
            setShowRules(true);
          }}
          className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/80 transition-colors border border-white/10 backdrop-blur-sm"
          title={t('rules.title')}
        >
          <HelpCircle className="w-6 h-6" />
        </button>

        {(phase === GamePhase.LOBBY || phase === GamePhase.PLAYING) && <button
          onClick={() => { audio.playPop(); setShowQr(true); }}
          className="inline-flex items-center gap-2 px-3 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-full text-slate-950 font-black transition-all border border-cyan-200 shadow-[0_0_18px_rgba(34,211,238,.35)]"
          title={t('qr.game')}
        ><UserPlus className="w-5 h-5"/><span className="hidden sm:inline">{t('btn.join')}</span></button>}

        <div className="relative">
          <button 
            onClick={() => {
              audio.playPop();
              setShowLangMenu(!showLangMenu);
            }}
            className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/80 transition-colors border border-white/10 backdrop-blur-sm"
            title="Change Language"
          >
            <Globe className="w-6 h-6" />
          </button>
          
          {showLangMenu && (
            <div className="absolute bottom-full right-0 mb-2 w-36 bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    audio.playPop();
                    setLang(l.code);
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    lang === l.code ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
