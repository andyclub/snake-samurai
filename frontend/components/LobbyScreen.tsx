import React from 'react';
import { Player } from '../types';
import { Users, QrCode, Play, Sparkles } from 'lucide-react';

interface Props {
  player: Player;
  players: Player[];
  lobbyEndsAt?: number | null;
  onStart: () => void;
  t: (key: string) => string;
}

export const LobbyScreen: React.FC<Props> = ({ player, players, lobbyEndsAt, onStart, t }) => {
  const secondsLeft = lobbyEndsAt ? Math.max(0, Math.ceil((lobbyEndsAt - Date.now()) / 1000)) : 30;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-center p-6 select-none overflow-y-auto">
      <div className="max-w-md w-full bg-slate-900 border border-cyan-500/30 rounded-3xl p-8 shadow-2xl space-y-6 text-center">
        {/* Title & Banner */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-black">
            <Sparkles className="w-4 h-4 text-cyan-400" /> 聴風・侍蛇 (snake-samurai)
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            比赛招募集结中
          </h1>
          <p className="text-xs text-slate-400">
            倒计时结束将自动开启 120 秒实时拼词与组句对战
          </p>
        </div>

        {/* 30s Countdown Display */}
        <div className="bg-slate-950 border border-cyan-500/40 rounded-2xl py-5 shadow-inner">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">集结倒计时</div>
          <div className="text-5xl font-black font-mono text-cyan-400 mt-1">
            {secondsLeft} <span className="text-sm font-normal text-slate-500">秒</span>
          </div>
        </div>

        {/* Joined Players */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
            <span className="flex items-center gap-1.5 text-cyan-300">
              <Users className="w-4 h-4" /> 已准备玩家 ({players.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-slate-950/60 rounded-xl border border-white/5">
            {players.map(p => (
              <span
                key={p.id}
                style={{ backgroundColor: `${p.color}25`, borderColor: p.color }}
                className="px-3 py-1.5 rounded-xl border text-xs font-extrabold text-white flex items-center gap-1.5"
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
            ))}
          </div>
        </div>

        {/* QR Code */}
        <div className="pt-2 flex flex-col items-center">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(window.location.href)}`}
            alt="Scan to join"
            className="w-36 h-36 rounded-2xl border-4 border-white/10 shadow-lg"
          />
          <span className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <QrCode className="w-3.5 h-3.5 text-cyan-400" /> 扫码加入房间
          </span>
        </div>

        {/* Start Button */}
        <button
          onClick={onStart}
          className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 active:scale-98 font-black text-slate-950 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 text-lg"
        >
          <Play className="w-6 h-6 fill-current" /> 立即开始比赛 (120s)
        </button>
      </div>
    </div>
  );
};

export default LobbyScreen;
