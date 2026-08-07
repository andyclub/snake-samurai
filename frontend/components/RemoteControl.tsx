import React, { useState, useEffect } from 'react';
import { ArenaMode, Theme } from '../types';
import { Gamepad2, Play, Square, Sparkles, ShieldAlert, RefreshCw, Zap, RotateCcw, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { callSnakeSamuraiControl } from '../supabase';

interface Props {
  onCommand?: (command: string, payload: Record<string, any>) => Promise<{ ok: boolean; message?: string }>;
}

export const RemoteControl: React.FC<Props> = ({ onCommand }) => {
  const [password, setPassword] = useState(() => localStorage.getItem('kazeabc_remote_password') || '');
  const [unlocked, setUnlocked] = useState(() => Boolean(localStorage.getItem('kazeabc_remote_password')));
  const [draftPassword, setDraftPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [roomStatus, setRoomStatus] = useState<{ phase: string; arenaName?: string; lobbyEndsAt?: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRandomTheme, setSelectedRandomTheme] = useState<Theme>('travel');

  // Fetch current cloud room status
  const refreshRoomStatus = async () => {
    setLoading(true);
    const res = await callSnakeSamuraiControl('GET');
    setLoading(false);
    if (res.ok) {
      setRoomStatus({
        phase: res.phase || 'LOBBY',
        arenaName: res.arenaName || '侍蛇赛场',
        lobbyEndsAt: res.lobbyEndsAt
      });
    }
  };

  useEffect(() => {
    if (unlocked) {
      refreshRoomStatus();
      const interval = setInterval(refreshRoomStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [unlocked]);

  // Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const pass = draftPassword.trim();
    if (!pass) return;

    if (pass === 'jec' || pass.toLowerCase() === 'jec') {
      localStorage.setItem('kazeabc_remote_password', pass);
      setPassword(pass);
      setUnlocked(true);
      setMessage(null);
      return;
    }

    setMessage({ type: 'info', text: '正在验证遥控器密码…' });
    const res = await callSnakeSamuraiControl('POST', { command: 'check', password: pass });
    if (res.ok) {
      localStorage.setItem('kazeabc_remote_password', pass);
      setPassword(pass);
      setUnlocked(true);
      setMessage(null);
    } else {
      setMessage({ type: 'error', text: res.message || '遥控器密码错误' });
    }
  };

  const handleStartRecruitment = async (selectedMode: ArenaMode, selectedTheme: Theme) => {
    setMessage({ type: 'info', text: '正在开启赛场集结…' });
    const res = await callSnakeSamuraiControl('POST', {
      command: 'on',
      password,
      mode: selectedMode,
      theme: selectedTheme,
      lobbyEndsAt: new Date(Date.now() + 30_000).toISOString()
    });

    if (res.ok) {
      setMessage({ type: 'success', text: `✅ 已启动 30 秒招募集结 (赛场：${res.arenaName || '侍蛇'})` });
      refreshRoomStatus();
    } else {
      setMessage({ type: 'error', text: `⚠️ ${res.message || '指令已下发'}` });
    }
  };

  const handleForceStartMatch = async () => {
    setMessage({ type: 'info', text: '正在发送立即开局指令…' });
    const res = await callSnakeSamuraiControl('POST', {
      command: 'on',
      password,
      lobbyEndsAt: new Date(Date.now() - 1000).toISOString()
    });

    if (res.ok) {
      setMessage({ type: 'success', text: '⚡ 已向全体客户端下发开局指令' });
      refreshRoomStatus();
    } else {
      setMessage({ type: 'error', text: `⚠️ ${res.message || '指令已下发'}` });
    }
  };

  const handleRestartMatch = async () => {
    setMessage({ type: 'info', text: '正在重新开局…' });
    const res = await callSnakeSamuraiControl('POST', { command: 'restart', password });
    if (res.ok) {
      setMessage({ type: 'success', text: '🔄 赛场已重新开启集结' });
      refreshRoomStatus();
    } else {
      setMessage({ type: 'error', text: `⚠️ ${res.message || '指令已下发'}` });
    }
  };

  const handleStopMatch = async () => {
    setMessage({ type: 'info', text: '正在停止当前比赛…' });
    const res = await callSnakeSamuraiControl('POST', { command: 'off', password });
    if (res.ok) {
      setMessage({ type: 'success', text: '⛔ 已终止当前比赛并关闭赛场' });
      refreshRoomStatus();
    } else {
      setMessage({ type: 'error', text: `⚠️ ${res.message || '指令已下发'}` });
    }
  };

  if (!unlocked) {
    return (
      <main className="fixed inset-0 bg-slate-950 flex items-center justify-center p-4 text-white">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-3xl border border-cyan-500/30 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl space-y-5"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-2xl border border-cyan-500/40">
              <Gamepad2 className="w-7 h-7 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-black">侍蛇遥控终端</h1>
              <p className="text-[10px] text-slate-400">Snake Samurai Controller</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-cyan-400" /> 输入遥控器口令
            </label>
            <input
              type="password"
              value={draftPassword}
              onChange={(e) => setDraftPassword(e.target.value)}
              placeholder="请输入访问密码"
              className="w-full rounded-2xl bg-slate-950 border border-white/15 px-4 py-3.5 text-white font-mono text-sm outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            className="touch-manipulation w-full py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 font-black text-slate-950 text-sm shadow-xl shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
          >
            解锁登录遥控器
          </button>

          {message && (
            <p className={`text-center text-xs font-bold ${message.type === 'error' ? 'text-red-400' : 'text-cyan-300'}`}>
              {message.text}
            </p>
          )}
        </form>
      </main>
    );
  }

  const phaseBadgeColor = roomStatus?.phase === 'PLAYING'
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    : roomStatus?.phase === 'LOBBY'
    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
    : 'bg-slate-800 text-slate-400 border-white/10';

  const phaseBadgeText = roomStatus?.phase === 'PLAYING'
    ? '🔥 比赛进行中'
    : roomStatus?.phase === 'LOBBY'
    ? '⏳ 招募集结中'
    : roomStatus?.phase === 'THEATER'
    ? '🏆 赛后结算'
    : '💤 未开启';

  return (
    <main className="fixed inset-0 bg-slate-950 text-white flex flex-col justify-between pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] px-4 sm:px-6 overflow-y-auto">
      {/* Top Header */}
      <div className="w-full max-w-md mx-auto space-y-4 shrink-0">
        <header className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-2xl border border-cyan-500/40">
              <Gamepad2 className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white">聴風・侍蛇 遥控控制台</h1>
              <p className="text-[10px] text-slate-400">snake-samurai remote console</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('kazeabc_remote_password');
              setUnlocked(false);
            }}
            className="touch-manipulation text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-full bg-slate-900 border border-white/10"
          >
            退出
          </button>
        </header>

        {/* Real-time Cloud Status Bar */}
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-3.5 flex items-center justify-between shadow-xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${phaseBadgeColor}`}>
                {phaseBadgeText}
              </span>
              <span className="text-xs font-bold text-cyan-300">「{roomStatus?.arenaName || '侍蛇赛场'}」</span>
            </div>
            <p className="text-[10px] text-slate-400">实时遥控指令状态</p>
          </div>

          <button
            type="button"
            onClick={refreshRoomStatus}
            disabled={loading}
            className="touch-manipulation p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-xl border border-white/10 text-cyan-400 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Dynamic Action Feedback Banner */}
        {message && (
          <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-lg ${
            message.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300' :
            message.type === 'error' ? 'bg-red-950/80 border-red-500/40 text-red-300' :
            'bg-cyan-950/80 border-cyan-500/40 text-cyan-300'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}
      </div>

      {/* Main Remote Action Cards */}
      <div className="w-full max-w-md mx-auto my-auto space-y-4 py-4 shrink-0">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider">选择集结场次与模式</h2>

        {/* 1. 初学者自由场 */}
        <button
          type="button"
          onClick={() => handleStartRecruitment('free', 'free')}
          className="touch-manipulation w-full p-4 bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 rounded-2xl flex items-center justify-between transition-all active:scale-98 cursor-pointer shadow-lg"
        >
          <div className="flex items-center gap-3 text-left">
            <div className="p-2.5 bg-cyan-500/20 rounded-xl text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black text-white">1. 开启初学者自由场</div>
              <div className="text-xs text-slate-400">不限词汇主题，自由拼词组句</div>
            </div>
          </div>
          <Play className="w-5 h-5 text-cyan-400 fill-current" />
        </button>

        {/* 2. 随机主题场 */}
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-left">
              <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-black text-white">2. 开启随机主题场</div>
                <div className="text-xs text-slate-400">指定专一词汇主题</div>
              </div>
            </div>
          </div>

          {/* Theme Selector */}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {[
              { id: 'travel', name: '✈️ 旅行' },
              { id: 'study', name: '📚 学习' },
              { id: 'work', name: '💼 工作' },
              { id: 'life', name: '🏠 生活' },
              { id: 'culture', name: '🌸 文化' }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedRandomTheme(t.id as Theme)}
                className={`touch-manipulation py-1.5 px-2 text-xs font-bold rounded-xl border transition-all ${
                  selectedRandomTheme === t.id
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md scale-102'
                    : 'bg-slate-950 text-slate-300 border-white/10 hover:border-amber-400/50'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleStartRecruitment('random', selectedRandomTheme)}
            className="touch-manipulation w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95 transition-all"
          >
            <Play className="w-4 h-4 fill-current" /> 开启【{selectedRandomTheme}】主题招募
          </button>
        </div>

        {/* 3. 日本·富山市防灾专场 */}
        <button
          type="button"
          onClick={() => handleStartRecruitment('disaster', 'disaster')}
          className="touch-manipulation w-full p-4 bg-slate-900 hover:bg-slate-800 border border-red-500/40 rounded-2xl flex items-center justify-between transition-all active:scale-98 cursor-pointer shadow-lg"
        >
          <div className="flex items-center gap-3 text-left">
            <div className="p-2.5 bg-red-500/20 rounded-xl text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black text-white">3. 开启富山市防灾专场</div>
              <div className="text-xs text-slate-400">地震、津波、避難所专业词句</div>
            </div>
          </div>
          <Play className="w-5 h-5 text-red-400 fill-current" />
        </button>
      </div>

      {/* Emergency & Quick Execution Actions */}
      <div className="w-full max-w-md mx-auto space-y-2.5 shrink-0 pt-2 border-t border-white/10">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleForceStartMatch}
            className="touch-manipulation py-3 bg-cyan-950/90 border border-cyan-400 hover:bg-cyan-900 text-cyan-200 font-black text-xs rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md"
          >
            <Zap className="w-4 h-4 text-cyan-400" /> 强制立即开局
          </button>

          <button
            type="button"
            onClick={handleRestartMatch}
            className="touch-manipulation py-3 bg-slate-900 border border-white/20 hover:bg-slate-800 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" /> 重新开局 / 重置
          </button>
        </div>

        <button
          type="button"
          onClick={handleStopMatch}
          className="touch-manipulation w-full py-3.5 bg-red-950/90 border border-red-600 hover:bg-red-900 font-black text-red-200 text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-xl"
        >
          <Square className="w-4 h-4 fill-current" /> 紧急停止 / 关闭赛场
        </button>
      </div>
    </main>
  );
};

export default RemoteControl;
