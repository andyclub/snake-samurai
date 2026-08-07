import React, { useState } from 'react';
import { ArenaMode, Theme } from '../types';
import { Gamepad2, Play, Square, Sparkles, ShieldAlert } from 'lucide-react';
import { callSnakeSamuraiControl } from '../supabase';

interface Props {
  onCommand: (command: string, payload: Record<string, any>) => Promise<{ ok: boolean; message?: string }>;
}

export const RemoteControl: React.FC<Props> = ({ onCommand }) => {
  const [password, setPassword] = useState(() => localStorage.getItem('kazeabc_remote_password') || '');
  const [unlocked, setUnlocked] = useState(() => Boolean(localStorage.getItem('kazeabc_remote_password')));
  const [draftPassword, setDraftPassword] = useState('');
  const [message, setMessage] = useState('');

  if (!unlocked) {
    return (
      <main className="flex h-full min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const pass = draftPassword.trim();
            if (!pass) return;

            // Immediate validation for password 'jec'
            if (pass === 'jec' || pass.toLowerCase() === 'jec') {
              localStorage.setItem('kazeabc_remote_password', pass);
              setPassword(pass);
              setUnlocked(true);
              setMessage('');
              return;
            }

            setMessage('正在验证密码…');
            const res = await callSnakeSamuraiControl('POST', { command: 'check', password: pass });
            if (res.ok) {
              localStorage.setItem('kazeabc_remote_password', pass);
              setPassword(pass);
              setUnlocked(true);
              setMessage('');
            } else {
              setMessage(res.message || '密码错误');
            }
          }}
          className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-7 shadow-2xl space-y-4"
        >
          <div className="flex items-center gap-3">
            <Gamepad2 className="w-7 h-7 text-cyan-400" />
            <h1 className="text-2xl font-black">遥控面板验证</h1>
          </div>
          <p className="text-xs text-slate-400">请输入管理员口令进行远程操作</p>
          <input
            type="password"
            value={draftPassword}
            onChange={(e) => setDraftPassword(e.target.value)}
            placeholder="访问密码"
            className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 text-white outline-none focus:border-cyan-400"
          />
          <button className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 font-black text-slate-950">
            验证登录
          </button>
          {message && <p className="text-center text-xs text-amber-300">{message}</p>}
        </form>
      </main>
    );
  }

  const handleStart = async (selectedMode: ArenaMode, selectedTheme: Theme) => {
    setMessage('正在发送开局指令…');
    const res = await onCommand('on', { password, mode: selectedMode, theme: selectedTheme, lobbyEndsAt: Date.now() + 30_000 });
    setMessage(res.ok ? '✅ 已启动 30 秒招募集结' : `⚠️ ${res.message}`);
  };

  const handleStop = async () => {
    const res = await onCommand('off', { password });
    setMessage(res.ok ? '✅ 已停止比赛' : `⚠️ ${res.message}`);
  };

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white max-w-lg mx-auto space-y-6 select-none">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <Gamepad2 className="w-8 h-8 text-cyan-400" />
          <div>
            <h1 className="text-xl font-black">聴風・侍蛇 遥控器</h1>
            <p className="text-xs text-slate-400">Remote Arena Controller</p>
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('kazeabc_remote_password');
            setUnlocked(false);
          }}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          退出
        </button>
      </div>

      {message && (
        <div className="bg-slate-900 border border-cyan-500/30 p-3 rounded-xl text-center text-sm font-bold text-cyan-300">
          {message}
        </div>
      )}

      {/* Preset Modes */}
      <div className="space-y-3">
        <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider">选择场次模式</h2>

        <button
          onClick={() => handleStart('free', 'free')}
          className="w-full p-4 bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 rounded-2xl flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-3 text-left">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            <div>
              <div className="font-extrabold text-white">1. 初学者自由场</div>
              <div className="text-xs text-slate-400">不限主题，自由拼词组句</div>
            </div>
          </div>
          <Play className="w-5 h-5 text-cyan-400" />
        </button>

        <button
          onClick={() => handleStart('random', 'travel')}
          className="w-full p-4 bg-slate-900 hover:bg-slate-800 border border-amber-500/40 rounded-2xl flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-3 text-left">
            <Sparkles className="w-6 h-6 text-amber-400" />
            <div>
              <div className="font-extrabold text-white">2. 随机主题场 (旅行)</div>
              <div className="text-xs text-slate-400">仅限当前主题相符词句</div>
            </div>
          </div>
          <Play className="w-5 h-5 text-amber-400" />
        </button>

        <button
          onClick={() => handleStart('disaster', 'disaster')}
          className="w-full p-4 bg-slate-900 hover:bg-slate-800 border border-red-500/40 rounded-2xl flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-3 text-left">
            <ShieldAlert className="w-6 h-6 text-red-400" />
            <div>
              <div className="font-extrabold text-white">3. 防灾专场</div>
              <div className="text-xs text-slate-400">地震、津波、避難所防灾知识词句</div>
            </div>
          </div>
          <Play className="w-5 h-5 text-red-400" />
        </button>
      </div>

      {/* Emergency Stop */}
      <div className="pt-4 border-t border-white/10">
        <button
          onClick={handleStop}
          className="w-full py-4 bg-red-950 border border-red-600 hover:bg-red-900 font-black text-red-200 rounded-2xl flex items-center justify-center gap-2"
        >
          <Square className="w-5 h-5" /> 停止/重置当前赛场
        </button>
      </div>
    </main>
  );
};

export default RemoteControl;
