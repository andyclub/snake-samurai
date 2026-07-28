import React, { useCallback, useEffect, useState } from 'react';
import { Play, Power, RotateCcw, Volume2, Gamepad2, Users, Wifi, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, History } from 'lucide-react';
import { audio } from '../audio';
import { CommandResult, HistoryResult } from '../useRansenMultiplayer';
import { AuditEvent, GamePhase, HistoryParticipant, MatchHistory } from '../types';
import { callRansenControl } from '../supabase';

interface Props {
  onCommand: (command: string, password: string) => Promise<CommandResult>;
  connection: 'connecting' | 'online' | 'error';
  phase: string;
  playerCount: number;
  onlineCount: number;
  fetchHistory: (password: string, page: number) => Promise<HistoryResult>;
}

const participantBadge = (participant: HistoryParticipant) => (
  <span key={participant.id} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[.06] px-2.5 py-1 text-xs text-slate-200">
    {participant.name}
    <small className={participant.participantType === 'bot' ? 'text-amber-300' : 'text-cyan-300'}>
      {participant.participantType === 'bot' ? '机器人' : '真人'}
    </small>
  </span>
);

const durationLabel = (seconds: number) => `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`;
const dateLabel = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(new Date(value));
const reasonLabels: Record<MatchHistory['terminationReason'], string> = {
  timeout: '比赛计时结束',
  last_slime: '仅剩一只史莱姆',
  manual_off: '手动关闭',
  manual_restart: '手动重开',
};
const eventLabels: Record<AuditEvent['type'], string> = {
  match_started: '比赛开始',
  battle_started: '战斗开始',
  battle_resolved: '战斗结算',
  match_ended: '比赛结束',
};
const phaseLabels: Record<GamePhase, string> = {
  [GamePhase.OFF]: '未开场',
  [GamePhase.LOBBY]: '招募中',
  [GamePhase.PLAYING]: '对战中',
  [GamePhase.THEATER]: '结果展示',
};

const RemoteControl: React.FC<Props> = ({ onCommand, fetchHistory, connection, phase, playerCount, onlineCount }) => {
  const [sending, setSending] = useState<string>();
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState(() => localStorage.getItem('kazeabc_remote_password') || '');
  const [draftPassword, setDraftPassword] = useState('');
  const [unlocked, setUnlocked] = useState(() => Boolean(localStorage.getItem('kazeabc_remote_password')));
  const [history, setHistory] = useState<MatchHistory[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [expandedMatch, setExpandedMatch] = useState<number>();
  const [activeTab, setActiveTab] = useState<'control' | 'history'>(() =>
    new URLSearchParams(window.location.search).get('view') === 'history' ? 'history' : 'control'
  );
  const currentArena = new URLSearchParams(window.location.search).get('arena') === 'bousai-toyama' ? 'bousai-toyama' : 'main';
  const [arenaPhases, setArenaPhases] = useState<Record<'main' | 'bousai-toyama', GamePhase | null>>({
    main: currentArena === 'main' ? phase as GamePhase : null,
    'bousai-toyama': currentArena === 'bousai-toyama' ? phase as GamePhase : null,
  });
  const buttons = [
    { command: 'on', label: '开启游戏', icon: Play, color: 'from-emerald-500 to-cyan-500' },
    { command: 'off', label: '关闭游戏', icon: Power, color: 'from-rose-500 to-orange-500' },
    { command: 'replay', label: '重新播报结果', icon: Volume2, color: 'from-violet-500 to-fuchsia-500' },
    { command: 'restart', label: '重开当前游戏', icon: RotateCcw, color: 'from-blue-500 to-indigo-500' },
    { command: 'add_bot', label: '增加机器人', icon: null, emoji: '🤖', color: 'from-amber-500 to-yellow-600' },
  ];
  const loadHistory = useCallback(async () => {
    if (!unlocked || !password) return;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const result = await fetchHistory(password, historyPage);
      if (!result.ok) throw new Error(result.message || '历史记录读取失败');
      setHistory(result.matches);
      setHistoryPages(result.totalPages);
      if (result.totalPages > 0 && historyPage > result.totalPages) setHistoryPage(result.totalPages);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : '历史记录读取失败');
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchHistory, historyPage, password, unlocked]);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory, phase]);

  useEffect(() => {
    if (Object.values(GamePhase).includes(phase as GamePhase)) {
      setArenaPhases(current => ({ ...current, [currentArena]: phase as GamePhase }));
    }
  }, [currentArena, phase]);

  useEffect(() => {
    let cancelled = false;
    const refreshArenaPhases = async () => {
      const [main, disaster] = await Promise.all([
        callRansenControl('GET', undefined, 'main'),
        callRansenControl('GET', undefined, 'bousai-toyama'),
      ]);
      if (cancelled) return;
      setArenaPhases({
        main: main.ok && main.phase ? main.phase : null,
        'bousai-toyama': disaster.ok && disaster.phase ? disaster.phase : null,
      });
    };
    void refreshArenaPhases();
    const timer = window.setInterval(refreshArenaPhases, 5000);
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refreshArenaPhases(); };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  const switchFeatureTab = (tab: 'control' | 'history') => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === 'history') url.searchParams.set('view', 'history');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
  };
  const arenaUrl = (arena: 'main' | 'bousai-toyama') => {
    const url = new URL(window.location.href);
    if (arena === 'main') url.searchParams.delete('arena');
    else url.searchParams.set('arena', arena);
    if (activeTab === 'history') url.searchParams.set('view', 'history');
    return `${url.pathname}${url.search}`;
  };
  const arenaStatus = (arena: 'main' | 'bousai-toyama') => {
    const arenaPhase = arenaPhases[arena];
    return {
      dot: arenaPhase === null ? '⚪' : arenaPhase === GamePhase.OFF ? '🔴' : '🟢',
      label: arenaPhase === null ? '状态未知' : phaseLabels[arenaPhase],
    };
  };

  if (!unlocked) return <main className="flex h-full items-center justify-center overflow-y-auto bg-[#070b18] p-5"><form onSubmit={async event => { event.preventDefault(); setMessage('正在验证…'); const result = await onCommand('check', draftPassword); setMessage(`${result.ok ? '✅' : '⚠️'} ${result.message}`); if (result.ok) { localStorage.setItem('kazeabc_remote_password', draftPassword); setPassword(draftPassword); setUnlocked(true); } }} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-900/80 p-7 shadow-2xl"><div className="flex items-center gap-3 mb-2"><Gamepad2 className="text-cyan-300"/><h1 className="text-2xl font-black">遥控器验证</h1></div><p className="text-sm text-slate-400 mb-5">首次输入后会保存在此浏览器中。</p><input autoFocus required type="password" value={draftPassword} onChange={e=>setDraftPassword(e.target.value)} placeholder="15 位访问密码" className="w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 outline-none focus:border-cyan-400"/><button className="mt-4 w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 font-black text-slate-950">验证并保存</button>{message && <p className="mt-4 text-center text-sm text-slate-300">{message}</p>}</form></main>;
  return <main className="h-full touch-pan-y overflow-y-auto overscroll-y-contain bg-[#070b18]">
    <div className="mx-auto w-full max-w-3xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] sm:px-6">
      <header className="mb-4">
        <div className="flex items-center gap-3"><Gamepad2 className="text-cyan-300"/><h1 className="text-2xl font-black">听风大乱斗遥控器</h1></div>
        <p className="mt-1 text-sm text-slate-400">控制游戏并查看每场对战记录。</p>
      </header>
      <div className="sticky top-0 z-30 mb-5 space-y-2 rounded-2xl border border-white/10 bg-[#070b18]/95 p-2 shadow-xl backdrop-blur-xl">
        <div role="tablist" aria-label="场地切换" className="grid grid-cols-2 gap-2">
          <a role="tab" aria-selected={currentArena === 'main'} aria-label={`默认场次，${arenaStatus('main').label}`} title={`默认场次 · ${arenaStatus('main').label}`} href={arenaUrl('main')} className={`rounded-xl px-3 py-2.5 text-center text-sm font-black ${currentArena === 'main' ? 'bg-cyan-500 text-slate-950' : 'bg-white/[.04] text-slate-300'}`}>默认（{arenaStatus('main').dot}）</a>
          <a role="tab" aria-selected={currentArena === 'bousai-toyama'} aria-label={`防灾场次，${arenaStatus('bousai-toyama').label}`} title={`防灾场次 · ${arenaStatus('bousai-toyama').label}`} href={arenaUrl('bousai-toyama')} className={`rounded-xl px-3 py-2.5 text-center text-sm font-black ${currentArena === 'bousai-toyama' ? 'bg-orange-500 text-white' : 'bg-white/[.04] text-slate-300'}`}>防灾（{arenaStatus('bousai-toyama').dot}）</a>
        </div>
        <nav role="tablist" aria-label="遥控器功能" className="grid grid-cols-2 gap-2">
          <button role="tab" id="remote-control-tab" aria-selected={activeTab === 'control'} aria-controls="remote-control-panel" onClick={() => switchFeatureTab('control')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition-colors ${activeTab === 'control' ? 'bg-cyan-500/20 text-cyan-100' : 'text-slate-500 hover:bg-white/[.06] hover:text-white'}`}><Gamepad2 className="h-4 w-4"/>遥控</button>
          <button role="tab" id="remote-history-tab" aria-selected={activeTab === 'history'} aria-controls="remote-history-panel" onClick={() => switchFeatureTab('history')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition-colors ${activeTab === 'history' ? 'bg-violet-500/25 text-violet-100' : 'text-slate-500 hover:bg-white/[.06] hover:text-white'}`}><History className="h-4 w-4"/>记录</button>
        </nav>
      </div>
    {activeTab === 'control' && <section id="remote-control-panel" role="tabpanel" aria-labelledby="remote-control-tab" className="mx-auto w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900/80 p-5 shadow-2xl sm:p-6">
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
      <div className="grid grid-cols-2 gap-4">{buttons.map(({command,label,icon:Icon,emoji,color}) => { const unavailable = command === 'add_bot' && phase !== 'LOBBY'; return <button disabled={Boolean(sending) || unavailable} key={command} onClick={async () => { audio.playPop(); setSending(command); setMessage('等待云端确认…'); try { const result = await onCommand(command, password); setMessage(`${result.ok ? '✅' : '⚠️'} ${result.message}`); if (result.ok && (command === 'off' || command === 'restart')) window.setTimeout(loadHistory, 300); } catch (error) { console.error('Remote command failed', error); setMessage('⚠️ 云端连接失败，请重试'); } finally { setSending(undefined); } }} className={`min-h-32 rounded-2xl bg-gradient-to-br ${color} p-4 font-black text-white shadow-lg active:scale-95 transition-transform flex flex-col items-center justify-center gap-3 disabled:opacity-35 ${command === 'add_bot' ? 'col-span-2' : ''}`}>{Icon ? <Icon className={`w-9 h-9 ${sending === command ? 'animate-pulse' : ''}`}/> : <span className={`text-4xl ${sending === command ? 'animate-bounce' : ''}`}>{emoji}</span>}{label}{unavailable && <small className="font-normal text-white/70">仅开场倒计时可用</small>}</button>})}</div>
      <div className="mt-5 flex items-center justify-center gap-2 text-xs"><span className={`w-2 h-2 rounded-full ${connection === 'online' ? 'bg-emerald-400' : connection === 'error' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'}`}/><span className="text-slate-400">{message || (connection === 'online' ? '云端遥控已连接' : connection === 'error' ? '云端连接异常' : '正在连接云端…')}</span></div>
      <button onClick={() => { localStorage.removeItem('kazeabc_remote_password'); setPassword(''); setUnlocked(false); setMessage(''); }} className="mt-4 w-full text-xs text-slate-600 hover:text-slate-400">清除此设备保存的密码</button>
    </section>}
    {activeTab === 'history' && <section id="remote-history-panel" role="tabpanel" aria-labelledby="remote-history-tab" className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-4 shadow-2xl sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><h2 className="text-xl font-black text-white">游戏历史</h2><p className="mt-1 text-xs text-slate-400">每页显示最近 10 场 · 点击场次查看审计详情</p></div>
        <button onClick={loadHistory} disabled={historyLoading} aria-label="刷新历史" className="rounded-xl border border-white/10 bg-white/[.06] p-2.5 text-cyan-200 disabled:opacity-40"><RefreshCw className={`h-5 w-5 ${historyLoading ? 'animate-spin' : ''}`}/></button>
      </div>
      {historyError && <div className="mb-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{historyError} <button onClick={loadHistory} className="ml-2 underline">重试</button></div>}
      {historyLoading && history.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">正在读取历史记录…</p> : history.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">还没有已记录的比赛</p> :
        <div className="space-y-3">{history.map(match => {
          const expanded = expandedMatch === match.matchNumber;
          return <article key={match.matchNumber} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <button onClick={() => setExpandedMatch(expanded ? undefined : match.matchNumber)} aria-expanded={expanded} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 p-4 text-left">
              <div><div className="flex flex-wrap items-center gap-2"><b className="text-white">第 {match.matchNumber} 场</b><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${match.status === 'completed' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>{match.status === 'completed' ? '已完成' : '未完成'}</span></div><p className="mt-1 text-xs text-slate-400">{dateLabel(match.startedAt)} · {durationLabel(match.durationSeconds)} · {match.humanCount} 名真人</p></div>
              <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
            </button>
            {expanded && <div className="space-y-4 border-t border-white/10 p-4 text-sm">
              <div className="grid gap-2 text-slate-300 sm:grid-cols-2"><p><span className="text-slate-500">终止原因：</span>{reasonLabels[match.terminationReason] || match.terminationReason}</p><p><span className="text-slate-500">最后记录：</span>{dateLabel(match.lastSnapshotAt)}</p><p><span className="text-slate-500">参与统计：</span>{match.humanCount} 真人 / {match.botCount} 机器人</p><p><span className="text-slate-500">胜负：</span>{match.status === 'completed' ? '已决' : '未决'}</p></div>
              <div><h3 className="mb-2 font-bold text-slate-300">全部参与方</h3><div className="flex flex-wrap gap-2">{match.participants.map(participantBadge)}</div></div>
              {match.status === 'completed' ? <><div><h3 className="mb-2 font-bold text-emerald-300">胜方</h3><div className="flex flex-wrap gap-2">{match.winners.map(participantBadge)}</div></div><div><h3 className="mb-2 font-bold text-rose-300">负方</h3><div className="flex flex-wrap gap-2">{match.losers.map(participantBadge)}</div></div></> :
                <><div><h3 className="mb-2 font-bold text-amber-300">中断时暂时领先</h3><div className="flex flex-wrap gap-2">{match.provisionalLeaders.map(participantBadge)}</div></div><div><h3 className="mb-2 font-bold text-cyan-300">中断时仍存活</h3><div className="flex flex-wrap gap-2">{match.survivingParticipants.map(participantBadge)}</div></div></>}
              <div><h3 className="mb-2 font-bold text-slate-300">事件时间线</h3><ol className="space-y-2 border-l border-slate-700 pl-4">{match.events.length ? match.events.map(event => <li key={event.id} className="relative text-xs text-slate-400 before:absolute before:-left-[1.22rem] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-cyan-400"><b className="text-slate-200">+{durationLabel(Math.max(0, Math.round((event.at - Date.parse(match.startedAt)) / 1000)))}</b> · {eventLabels[event.type] || event.type}{event.details?.outcome ? ` · ${event.details.outcome === 'devour' ? '吞噬' : '分裂'}` : ''}{event.details?.winner ? ` · ${event.details.winner} 胜` : ''}</li>) : <li className="text-xs text-slate-500">没有可用的事件明细</li>}</ol></div>
            </div>}
          </article>;
        })}</div>}
      <div className="mt-5 flex items-center justify-center gap-4">
        <button disabled={historyPage <= 1 || historyLoading} onClick={() => setHistoryPage(page => page - 1)} className="rounded-xl border border-white/10 p-2 text-slate-300 disabled:opacity-30"><ChevronLeft/></button>
        <span className="min-w-20 text-center text-sm text-slate-400">第 {historyPage} / {Math.max(historyPages, 1)} 页</span>
        <button disabled={historyPage >= historyPages || historyLoading} onClick={() => setHistoryPage(page => page + 1)} className="rounded-xl border border-white/10 p-2 text-slate-300 disabled:opacity-30"><ChevronRight/></button>
      </div>
    </section>}
    </div>
  </main>;
};
export default RemoteControl;
