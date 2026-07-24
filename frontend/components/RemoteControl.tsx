import React, { useState } from 'react';
import { Play, Power, RotateCcw, Volume2, Gamepad2, Users, Wifi } from 'lucide-react';
import { audio } from '../audio';
import { CommandResult } from '../useRansenMultiplayer';

interface Props {
  onCommand: (command: string, password: string) => Promise<CommandResult>;
  connection: 'connecting' | 'online' | 'error';
  phase: string;
  playerCount: number;
  onlineCount: number;
}

const RemoteControl: React.FC<Props> = ({ onCommand, connection, phase, playerCount, onlineCount }) => {
  const [sending, setSending] = useState<string>();
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState(() => localStorage.getItem('kazeabc_remote_password') || '');
  const [draftPassword, setDraftPassword] = useState('');
  const [unlocked, setUnlocked] = useState(() => Boolean(localStorage.getItem('kazeabc_remote_password')));
  const currentArena = new URLSearchParams(window.location.search).get('arena') === 'bousai-toyama' ? 'bousai-toyama' : 'main';
  const buttons = [
    { command: 'on', label: '开启游戏', icon: Play, color: 'from-emerald-500 to-cyan-500' },
    { command: 'off', label: '关闭游戏', icon: Power, color: 'from-rose-500 to-orange-500' },
    { command: 'replay', label: '重新播报结果', icon: Volume2, color: 'from-violet-500 to-fuchsia-500' },
    { command: 'restart', label: '重开当前游戏', icon: RotateCcw, color: 'from-blue-500 to-indigo-500' },
    { command: 'add_bot', label: '增加机器人', icon: null, emoji: '🤖', color: 'from-amber-500 to-yellow-600' },
  ];
  if (!unlocked) return <main className="min-h-full bg-[#070b18] flex items-center justify-center p-5"><form onSubmit={async event => { event.preventDefault(); setMessage('正在验证…'); const result = await onCommand('check', draftPassword); setMessage(`${result.ok ? '✅' : '⚠️'} ${result.message}`); if (result.ok) { localStorage.setItem('kazeabc_remote_password', draftPassword); setPassword(draftPassword); setUnlocked(true); } }} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-900/80 p-7 shadow-2xl"><div className="flex items-center gap-3 mb-2"><Gamepad2 className="text-cyan-300"/><h1 className="text-2xl font-black">遥控器验证</h1></div><p className="text-sm text-slate-400 mb-5">首次输入后会保存在此浏览器中。</p><input autoFocus required type="password" value={draftPassword} onChange={e=>setDraftPassword(e.target.value)} placeholder="15 位访问密码" className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:border-cyan-400"/><button className="mt-4 w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 font-black text-slate-950">验证并保存</button>{message && <p className="mt-4 text-center text-sm text-slate-300">{message}</p>}</form></main>;
  return <main className="min-h-full bg-[#070b18] flex items-center justify-center p-5">
    <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl">
      <div className="flex items-center gap-3 mb-2"><Gamepad2 className="text-cyan-300"/><h1 className="text-2xl font-black">听风大乱斗遥控器</h1></div>
      <p className="text-sm text-slate-400 mb-6">控制指令会通过云端立即同步到游戏画面。</p>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-black/25 p-2">
        <a href="/r" className={`rounded-xl px-3 py-2 text-center text-sm font-black ${currentArena === 'main' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}>默认场次</a>
        <a href="/r?arena=bousai-toyama" className={`rounded-xl px-3 py-2 text-center text-sm font-black ${currentArena === 'bousai-toyama' ? 'bg-orange-500 text-white' : 'text-slate-400'}`}>日本・富山市防灾</a>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[.07] p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-200/70"><Users className="h-4 w-4" />当前游戏人数</div>
          <div className="mt-1 text-3xl font-black text-emerald-100">{playerCount}<span className="ml-1 text-sm font-bold text-emerald-200/60">人</span></div>
        </div>
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[.07] p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-200/70"><Wifi className="h-4 w-4" />当前在线人数</div>
          <div className="mt-1 text-3xl font-black text-cyan-100">{onlineCount}<span className="ml-1 text-sm font-bold text-cyan-200/60">人</span></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">{buttons.map(({command,label,icon:Icon,emoji,color}) => { const unavailable = command === 'add_bot' && phase !== 'LOBBY'; return <button disabled={Boolean(sending) || unavailable} key={command} onClick={async () => { audio.playPop(); setSending(command); setMessage('等待云端确认…'); try { const result = await onCommand(command, password); setMessage(`${result.ok ? '✅' : '⚠️'} ${result.message}`); } catch (error) { console.error('Remote command failed', error); setMessage('⚠️ 云端连接失败，请重试'); } finally { setSending(undefined); } }} className={`min-h-32 rounded-2xl bg-gradient-to-br ${color} p-4 font-black text-white shadow-lg active:scale-95 transition-transform flex flex-col items-center justify-center gap-3 disabled:opacity-35 ${command === 'add_bot' ? 'col-span-2' : ''}`}>{Icon ? <Icon className={`w-9 h-9 ${sending === command ? 'animate-pulse' : ''}`}/> : <span className={`text-4xl ${sending === command ? 'animate-bounce' : ''}`}>{emoji}</span>}{label}{unavailable && <small className="font-normal text-white/70">仅开场倒计时可用</small>}</button>})}</div>
      <div className="mt-5 flex items-center justify-center gap-2 text-xs"><span className={`w-2 h-2 rounded-full ${connection === 'online' ? 'bg-emerald-400' : connection === 'error' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'}`}/><span className="text-slate-400">{message || (connection === 'online' ? '云端遥控已连接' : connection === 'error' ? '云端连接异常' : '正在连接云端…')}</span></div>
      <button onClick={() => { localStorage.removeItem('kazeabc_remote_password'); setPassword(''); setUnlocked(false); setMessage(''); }} className="mt-4 w-full text-xs text-slate-600 hover:text-slate-400">清除此设备保存的密码</button>
    </section>
  </main>;
};
export default RemoteControl;
