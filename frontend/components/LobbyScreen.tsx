import React, { useState, useEffect, useRef } from 'react';
import { Player, Slime } from '../types';
import { COLORS, generateBots } from '../mockData';
import { audio } from '../audio';
import FullscreenCountdown from './FullscreenCountdown';
import ArenaCards from './ArenaCards';
import HomeLink from './HomeLink';
import { registerRansenPlayer } from '../supabase';

interface Props {
  t: (key: string) => string;
  player: Player;
  onUpdatePlayer: (p: Player) => void;
  onStart: (slimes: Slime[]) => Promise<boolean>;
  setIsSpectator: (val: boolean) => void;
  isHost: boolean;
  onlinePlayers: Player[];
  extraBots: Player[];
  onShowQr: () => void;
  endsAt: number | null;
  arenaName: string;
  onSyncNeeded: () => void;
  roomId: string;
}

const LobbyScreen: React.FC<Props> = ({ t, player, onUpdatePlayer, onStart, setIsSpectator, isHost, onlinePlayers, extraBots, onShowQr, endsAt, arenaName, onSyncNeeded, roomId }) => {
  const [countdown, setCountdown] = useState(() => Math.max(0, Math.ceil(((endsAt ?? Date.now()) - Date.now()) / 1000)));
  const [localName, setLocalName] = useState(player.name);
  const [localColor, setLocalColor] = useState(player.color);
  const lastSyncRequestAt = useRef(0);
  const startAttemptForDeadline = useRef<number | null>(null);
  const [capacityMessage, setCapacityMessage] = useState('');
  const admittedPlayers = onlinePlayers.filter(member => !member.isSpectator).slice(0, 13);
  const admittedAudience = onlinePlayers.slice(0, 19);
  const playerSlotAvailable = admittedPlayers.some(member => member.id === player.id) || onlinePlayers.filter(member => !member.isSpectator).length < 13;
  const audienceSlotAvailable = admittedAudience.some(member => member.id === player.id) || onlinePlayers.length < 19;

  useEffect(() => {
    let cancelled = false;
    const register = async () => {
      const result = await registerRansenPlayer(player, roomId);
      if (!cancelled && !result.ok && result.message) setCapacityMessage(result.message);
    };
    register();
    const timer = window.setInterval(register, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [player.color, player.id, player.isSpectator, player.name, endsAt, roomId]);

  useEffect(() => {
    const deadline = endsAt ?? Date.now();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
          // Build the eligible roster before deciding who may start. A stale
          // spectator tab can remain the Realtime host after restart; the first
          // actual participant must then be able to take over the round.
          const playersById = new Map(onlinePlayers.map(member => [member.id, member]));
          playersById.set(player.id, player);
          const presentPlayers = [...playersById.values()];
          const humans = presentPlayers.filter(member => !member.isSpectator).slice(0, 13);
          // Hard invariant: never enter PLAYING without a participant.
          if (humans.length === 0) return;
          if (startAttemptForDeadline.current === deadline) return;
          startAttemptForDeadline.current = deadline;
          const automaticBots = humans.length === 1 ? generateBots(5) : [];
          const allPlayers = [...humans, ...extraBots, ...automaticBots];
          
          const initialSlimes: Slime[] = allPlayers.map((p, i) => ({
            id: `slime-${p.id}`,
            x: Math.random() * 800 + 100, // Random initial positions
            y: Math.random() * 600 + 100,
            targetX: 0,
            targetY: 0,
            size: 30,
            color: p.color,
            members: [p],
            isDead: false,
            memberTargets: {},
          }));
          
          // Initialize targets to current pos
          initialSlimes.forEach(s => {
            s.targetX = s.x;
            s.targetY = s.y;
          });

          void onStart(initialSlimes).then(started => {
            if (started) clearInterval(timer);
            else {
              startAttemptForDeadline.current = null;
              onSyncNeeded();
            }
          });
      }
    };
    const timer = setInterval(tick, 200);
    tick();

    return () => clearInterval(timer);
  }, [player, onStart, isHost, onlinePlayers, extraBots, endsAt, onSyncNeeded]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalName(e.target.value);
    onUpdatePlayer({ ...player, name: e.target.value });
  };

  const handleColorChange = (color: string) => {
    audio.playPop();
    setLocalColor(color);
    onUpdatePlayer({ ...player, color });
  };

  const chooseMode = (spectator: boolean) => {
    audio.playPop();
    if (!audienceSlotAvailable) {
      setCapacityMessage(t('capacity.totalFull'));
      return;
    }
    if (!spectator && !playerSlotAvailable) {
      setCapacityMessage(t('capacity.playersFull'));
      return;
    }
    setCapacityMessage('');
    setIsSpectator(spectator);
    onUpdatePlayer({ ...player, isSpectator: spectator });
  };

  return (
    <div className="w-full max-w-full h-full flex flex-col items-center justify-center bg-slate-900 relative overflow-hidden overscroll-none">
      <FullscreenCountdown value={countdown} label={t('countdown.gameStart')} />
      {/* Background decorative slimes */}
      <div className="absolute top-10 left-10 w-32 h-32 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
      <div className="absolute bottom-10 right-10 w-48 h-48 bg-emerald-500/20 rounded-full blur-xl animate-pulse delay-1000"></div>

      {/* Game URL QR Code (Bottom Left) */}
      <button onClick={onShowQr} title={t('qr.game')} className="absolute bottom-6 left-6 flex-col items-center gap-2 bg-black/40 p-3 rounded-xl backdrop-blur-sm border border-white/10 z-20 hidden sm:flex hover:scale-105 transition-transform">
        <div className="bg-white p-1.5 rounded-lg">
          <img 
            src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://g.kazeabc.com" 
            alt="Game QR" 
            className="w-20 h-20"
          />
        </div>
        <span className="text-xs text-slate-300 font-bold">{t('qr.game')}</span>
      </button>

      <div className="z-10 bg-black/40 p-8 rounded-3xl backdrop-blur-md border border-white/10 w-[calc(100%_-_2rem)] max-w-md max-h-[calc(100dvh_-_2rem)] overflow-y-auto overflow-x-hidden overscroll-contain flex flex-col items-center">
        <div className="mb-5 w-full"><ArenaCards t={t} arenaName={arenaName} active /></div>
        <h2 className="text-3xl font-bold text-white mb-6">{t('lobby.recruiting')}</h2>
        
        <div className="text-6xl font-mono font-bold text-emerald-400 mb-8 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]">
          {countdown}s
        </div>

        <div className="w-full space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => chooseMode(false)} aria-disabled={!playerSlotAvailable || !audienceSlotAvailable} className={`py-3 rounded-xl font-black border transition-all ${!player.isSpectator ? 'bg-emerald-500 text-slate-950 border-emerald-200' : 'bg-white/5 text-slate-300 border-white/10'} ${(!playerSlotAvailable || !audienceSlotAvailable) ? 'opacity-50' : ''}`}>🎮 {t('lobby.joinRound')}</button>
            <button onClick={() => chooseMode(true)} aria-disabled={!audienceSlotAvailable} className={`py-3 rounded-xl font-black border transition-all ${player.isSpectator ? 'bg-violet-500 text-white border-violet-200' : 'bg-white/5 text-slate-300 border-white/10'} ${!audienceSlotAvailable ? 'opacity-50' : ''}`}>👁 {t('lobby.keepWatching')}</button>
          </div>
          {capacityMessage && <div role="alert" className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-center text-sm font-black text-amber-100">⚠️ {capacityMessage}</div>}
          <div>
            <label className="block text-sm text-slate-400 mb-2">{t('lobby.name')}</label>
            <input 
              type="text" 
              value={localName}
              onChange={handleNameChange}
              className="w-full bg-black/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              maxLength={12}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">{t('lobby.color')}</label>
            <div className="flex gap-3 justify-center">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => handleColorChange(c)}
                  className={`w-10 h-10 rounded-full transition-transform ${localColor === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="mt-8 text-slate-400 animate-pulse">
          {t('lobby.waiting')} · {Math.min(13, onlinePlayers.filter(member => !member.isSpectator).length || (player.isSpectator ? 0 : 1))}/13 {t('lobby.players')} · {Math.min(19, onlinePlayers.length)}/19 {t('capacity.total')} {isHost ? `· ${t('lobby.host')}` : ''}
        </p>
        {extraBots.length > 0 && <div className="mt-3 flex flex-wrap justify-center gap-2">{extraBots.map(bot => <span key={bot.id} className="text-xs px-2 py-1 rounded-full bg-amber-400/10 border border-amber-300/20 text-amber-200">{bot.name} · IQ {bot.iq}</span>)}</div>}
        <div className="mt-6 border-t border-white/10 pt-5">
          <HomeLink />
        </div>
      </div>
    </div>
  );
};

export default LobbyScreen;
