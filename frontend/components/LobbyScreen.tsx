import React, { useState, useEffect } from 'react';
import { Player, Slime } from '../types';
import { COLORS, generateBots } from '../mockData';
import { audio } from '../audio';

interface Props {
  t: (key: string) => string;
  player: Player;
  onUpdatePlayer: (p: Player) => void;
  onStart: (slimes: Slime[]) => void;
  setIsSpectator: (val: boolean) => void;
}

const LobbyScreen: React.FC<Props> = ({ t, player, onUpdatePlayer, onStart, setIsSpectator }) => {
  const [countdown, setCountdown] = useState(30);
  const [localName, setLocalName] = useState(player.name);
  const [localColor, setLocalColor] = useState(player.color);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Generate initial game state
          const bots = generateBots(5);
          const allPlayers = [player, ...bots];
          
          const initialSlimes: Slime[] = allPlayers.map((p, i) => ({
            id: `slime-${p.id}`,
            x: Math.random() * 800 + 100, // Random initial positions
            y: Math.random() * 600 + 100,
            targetX: 0,
            targetY: 0,
            size: 30,
            color: p.color,
            members: [p],
            isDead: false
          }));
          
          // Initialize targets to current pos
          initialSlimes.forEach(s => {
            s.targetX = s.x;
            s.targetY = s.y;
          });

          onStart(initialSlimes);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [player, onStart]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalName(e.target.value);
    onUpdatePlayer({ ...player, name: e.target.value });
  };

  const handleColorChange = (color: string) => {
    audio.playPop();
    setLocalColor(color);
    onUpdatePlayer({ ...player, color });
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 relative overflow-hidden">
      {/* Background decorative slimes */}
      <div className="absolute top-10 left-10 w-32 h-32 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
      <div className="absolute bottom-10 right-10 w-48 h-48 bg-emerald-500/20 rounded-full blur-xl animate-pulse delay-1000"></div>

      {/* Game URL QR Code (Bottom Left) */}
      <div className="absolute bottom-6 left-6 flex flex-col items-center gap-2 bg-black/40 p-3 rounded-xl backdrop-blur-sm border border-white/10 z-20 hidden sm:flex">
        <div className="bg-white p-1.5 rounded-lg">
          <img 
            src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://g.kazeabc.com" 
            alt="Game QR" 
            className="w-20 h-20"
          />
        </div>
        <span className="text-xs text-slate-300 font-bold">{t('qr.game')}</span>
      </div>

      <div className="z-10 bg-black/40 p-8 rounded-3xl backdrop-blur-md border border-white/10 w-full max-w-md flex flex-col items-center">
        <h2 className="text-3xl font-bold text-white mb-6">{t('lobby.recruiting')}</h2>
        
        <div className="text-6xl font-mono font-bold text-emerald-400 mb-8 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]">
          {countdown}s
        </div>

        <div className="w-full space-y-6">
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
          {t('lobby.waiting')}
        </p>
      </div>
    </div>
  );
};

export default LobbyScreen;
