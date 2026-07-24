import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Encounter, GamePhase, Player, Slime } from './types';
import { callRansenControl, supabase } from './supabase';
import { generateRandomBot } from './mockData';

export type Snapshot = { phase: GamePhase; slimes: Slime[]; encounters: Encounter[]; startedAt?: number | null; lobbyEndsAt?: number | null; arenaName?: string; serverNow?: number };
type Connection = 'connecting' | 'online' | 'error';
export type CommandResult = { ok: boolean; message: string };

const normalizeEncounters = (slimes: Slime[], encounters: Encounter[], clockShift = 0) => {
  const allIds = new Set(slimes.map(slime => slime.id));
  const liveIds = new Set(slimes.filter(slime => !slime.isDead).map(slime => slime.id));
  const now = Date.now();
  return encounters.map(encounter => ({
    ...encounter,
    startTime: encounter.startTime + clockShift,
    result: encounter.result?.resolvedAt
      ? { ...encounter.result, resolvedAt: encounter.result.resolvedAt + clockShift }
      : encounter.result,
  })).filter(encounter => {
    // Legacy resolved encounters had no absolute cleanup timestamp and could
    // be rebroadcast forever by a tab running an older build.
    if (encounter.resolved) return Boolean(
      allIds.has(encounter.slime1Id) && allIds.has(encounter.slime2Id)
      && encounter.result?.resolvedAt && encounter.result.resolvedAt + 5000 > now
    );
    return liveIds.has(encounter.slime1Id) && liveIds.has(encounter.slime2Id);
  });
};

const preserveActiveEncounters = (slimes: Slime[], incoming: Encounter[], current: Encounter[]) => {
  const incomingIds = new Set(incoming.map(encounter => encounter.id));
  const liveById = new Map(slimes.filter(slime => !slime.isDead).map(slime => [slime.id, slime]));
  const now = Date.now();
  const retained = current.filter(encounter => {
    if (encounter.resolved || incomingIds.has(encounter.id) || now > encounter.startTime + 22_000) return false;
    const first = liveById.get(encounter.slime1Id);
    const second = liveById.get(encounter.slime2Id);
    if (!first || !second) return false;
    // A split keeps the old loser id alive, but its new spawn timestamp proves
    // that the battle was already resolved and must not be resurrected.
    return ![first, second].some(slime => slime.spawnedAt && slime.spawnedAt > encounter.startTime);
  });
  return retained.length ? [...incoming, ...retained] : incoming;
};

interface Options {
  roomId: string;
  player: Player;
  onCommand: (command: string, payload: Record<string, any>) => CommandResult;
  onSnapshot: (snapshot: Snapshot) => void;
  onInput: (playerId: string, x: number, y: number) => void;
  onVote: (playerId: string, encounterId: string, option: number, receivedAt?: number) => void;
  getSnapshot: () => Snapshot;
}

export function useRansenMultiplayer({ roomId, player, onCommand, onSnapshot, onInput, onVote, getSnapshot }: Options) {
  const [userId, setUserId] = useState<string>();
  const [isHost, setIsHost] = useState(false);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [onlinePlayers, setOnlinePlayers] = useState<Player[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const hostRef = useRef(false);
  const clockShiftRef = useRef<number | null>(null);
  const connectedAtRef = useRef(new Date().toISOString());
  const callbacks = useRef({ onCommand, onSnapshot, onInput, onVote, getSnapshot });
  const pendingCommands = useRef(new Map<string, (result: CommandResult) => void>());
  callbacks.current = { onCommand, onSnapshot, onInput, onVote, getSnapshot };

  useEffect(() => {
    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let channel: RealtimeChannel | null = null;
    const connect = async () => {
      try {
        const savedId = localStorage.getItem('kazeabc_device_id');
        const id = savedId || crypto.randomUUID();
        if (!savedId) localStorage.setItem('kazeabc_device_id', id);
        if (cancelled) return;
        setUserId(id);
        const multiplayerPlayer = { ...player, id };
        const isController = window.location.pathname.replace(/\/$/, '') === '/r';

        // The controller also reads the persisted room on first load. This
        // keeps its phase and participant count correct even when no game tab
        // is currently open to broadcast a snapshot.
        const control = await callRansenControl('GET', undefined, roomId);
        if (control.ok) {
          const clockShift = control.serverNow ? Date.now() - Date.parse(control.serverNow) : 0;
          const databaseDeadline = control.lobbyEndsAt ? Date.parse(control.lobbyEndsAt) + clockShift : null;
          if (control.phase === GamePhase.LOBBY) {
            callbacks.current.onCommand('on', { serverState: true, lobbyEndsAt: databaseDeadline, arenaName: control.arenaName });
          } else if (control.phase === GamePhase.PLAYING) {
            const stored = control.snapshot || {};
            const storedSlimes = Array.isArray(stored.slimes) ? stored.slimes : [];
            // Never enter the battlefield from a phase flag alone. A valid
            // game must contain at least one persisted slime.
            if (storedSlimes.length > 0) {
              const storedEncounters = Array.isArray(stored.encounters) ? stored.encounters as Encounter[] : [];
              callbacks.current.onSnapshot({
                phase: GamePhase.PLAYING,
                slimes: storedSlimes,
                encounters: normalizeEncounters(storedSlimes, storedEncounters, clockShift),
                startedAt: typeof stored.startedAt === 'number' ? stored.startedAt + clockShift : null,
                lobbyEndsAt: null,
                arenaName: control.arenaName,
              });
            }
          } else if (control.phase === GamePhase.THEATER) {
            const stored = control.snapshot || {};
            const storedSlimes = Array.isArray(stored.slimes) ? stored.slimes : [];
            if (storedSlimes.length > 0) callbacks.current.onSnapshot({
              phase: GamePhase.THEATER,
              slimes: storedSlimes,
              encounters: [],
              startedAt: typeof stored.startedAt === 'number' ? stored.startedAt + clockShift : null,
              lobbyEndsAt: null,
              arenaName: control.arenaName,
            });
            else callbacks.current.onCommand('off', { serverState: true, arenaName: control.arenaName });
          } else {
            callbacks.current.onCommand('off', { serverState: true, arenaName: control.arenaName });
          }
        }

        channel = supabase.channel(`ransen:${roomId}`, { config: { broadcast: { self: false, ack: true }, presence: { key: id } } })
          .on('broadcast', { event: 'state' }, ({ payload }) => {
            const snapshot = payload as Snapshot;
            if (snapshot.serverNow && clockShiftRef.current === null) clockShiftRef.current = Date.now() - snapshot.serverNow;
            const shift = clockShiftRef.current || 0;
            const incomingSlimes = snapshot.slimes || [];
            const normalizedEncounters = normalizeEncounters(incomingSlimes, snapshot.encounters || [], shift);
            callbacks.current.onSnapshot({
              ...snapshot,
              slimes: incomingSlimes,
              startedAt: snapshot.startedAt ? snapshot.startedAt + shift : snapshot.startedAt,
              lobbyEndsAt: snapshot.lobbyEndsAt ? snapshot.lobbyEndsAt + shift : snapshot.lobbyEndsAt,
              encounters: preserveActiveEncounters(incomingSlimes, normalizedEncounters, callbacks.current.getSnapshot().encounters || []),
            });
          })
          .on('broadcast', { event: 'request_state' }, async () => {
            if (hostRef.current) await channel?.send({ type: 'broadcast', event: 'state', payload: { ...callbacks.current.getSnapshot(), serverNow: Date.now() } });
          })
          .on('broadcast', { event: 'command' }, async ({ payload }) => {
            if (isController) return;
            const result = callbacks.current.onCommand(String(payload.command), payload);
            if (payload.commandId) await channel?.httpSend('command_result', { commandId: payload.commandId, ...result });
          })
          .on('broadcast', { event: 'command_result' }, ({ payload }) => {
            const resolve = pendingCommands.current.get(String(payload.commandId));
            if (resolve) { pendingCommands.current.delete(String(payload.commandId)); resolve({ ok: Boolean(payload.ok), message: String(payload.message) }); }
          })
          .on('broadcast', { event: 'input' }, ({ payload }) => callbacks.current.onInput(String(payload.playerId), Number(payload.x), Number(payload.y)))
          .on('broadcast', { event: 'vote' }, ({ payload }) => callbacks.current.onVote(String(payload.playerId), String(payload.encounterId), Number(payload.option), Date.now()))
          .on('presence', { event: 'sync' }, () => {
            const state = channel?.presenceState() || {};
            const entries = Object.entries(state).flatMap(([key, values]) => (values as any[]).map(value => ({ key, ...value })));
            const gameEntries = entries.filter((entry: any) => entry.role === 'game').sort((a: any, b: any) => a.key.localeCompare(b.key));
            // Reconnects can briefly expose multiple metas for one device. The
            // newest `track()` call is authoritative; an old spectator meta must
            // not override a later explicit "join this round" choice.
            const latestByPlayer = new Map<string, { player: Player; trackedAt: number }>();
            gameEntries.forEach((entry: any) => {
              const candidate = entry.player as Player | undefined;
              if (!candidate?.id) return;
              const trackedAt = Date.parse(String(entry.online_at || '')) || 0;
              const existing = latestByPlayer.get(candidate.id);
              if (!existing || trackedAt >= existing.trackedAt) latestByPlayer.set(candidate.id, { player: candidate, trackedAt });
            });
            const list = [...latestByPlayer.values()].sort((a, b) => a.trackedAt - b.trackedAt).map(entry => entry.player);
            setOnlinePlayers(list);
            const hostNow = !isController && gameEntries[0]?.key === id;
            hostRef.current = hostNow;
            setIsHost(hostNow);
          })
          .subscribe(async status => {
            if (status === 'SUBSCRIBED') {
              setConnection('online');
              await channel?.track({ player: multiplayerPlayer, role: isController ? 'controller' : 'game', online_at: connectedAtRef.current });
              if (!isController) window.setTimeout(() => channel?.send({ type: 'broadcast', event: 'request_state', payload: { playerId: id } }), 250);
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnection('error');
          });
        channelRef.current = channel;

      } catch (error) {
        console.error('Ransen multiplayer connection failed', error);
        if (!cancelled) setConnection('error');
      }
    };
    connect();
    return () => { cancelled = true; if (heartbeat) clearInterval(heartbeat); if (channel) supabase.removeChannel(channel); };
  }, [roomId]);

  useEffect(() => {
    if (!userId || !channelRef.current || window.location.pathname.replace(/\/$/, '') === '/r') return;
    channelRef.current.track({ player: { ...player, id: userId }, role: 'game', online_at: connectedAtRef.current });
  }, [player.color, player.isSpectator, player.name, userId]);

  const sendCommand = useCallback(async (command: string, password: string, publicStart = false) => {
    const control = await callRansenControl('POST', { command, password, roomId, ...(publicStart ? { public: true } : {}) }, roomId);
    if (!control.ok) return { ok: false, message: control.message || (control.status === 401 ? '遥控器密码错误' : '遥控服务不可用') };
    if (command === 'check') return { ok: true, message: '密码验证成功' };
    const clockShift = control.serverNow ? Date.now() - Date.parse(control.serverNow) : 0;
    const databaseDeadline = control.lobbyEndsAt ? Date.parse(control.lobbyEndsAt) + clockShift : null;
    if (control.persisted) callbacks.current.onCommand(command, { serverState: true, lobbyEndsAt: databaseDeadline, arenaName: control.arenaName });
    const commandId = crypto.randomUUID();
    const payload = { command, commandId, sentAt: Date.now(), lobbyEndsAt: databaseDeadline, arenaName: control.arenaName, ...(command === 'add_bot' ? { bot: generateRandomBot() } : {}) };
    const resultPromise = new Promise<CommandResult>(resolve => {
      pendingCommands.current.set(commandId, resolve);
      setTimeout(() => {
        if (pendingCommands.current.delete(commandId)) resolve({ ok: false, message: '游戏端未响应，请确认游戏页面已打开' });
      }, 5000);
    });
    // An unsubscribed channel deliberately uses Supabase's HTTP Broadcast path.
    // This keeps the remote reliable even while its WebSocket is still connecting.
    try {
      const httpChannel = channelRef.current || supabase.channel(`ransen:${roomId}`);
      const httpResult = await httpChannel.httpSend('command', payload, { timeout: 8000 });
      if (httpResult.success) {
        if (control.persisted) return Promise.race([
          resultPromise,
          new Promise<CommandResult>(resolve => setTimeout(() => {
            pendingCommands.current.delete(commandId);
            resolve({ ok: true, message: control.message || '控制状态已保存' });
          }, 1500)),
        ]);
        return resultPromise;
      }
    } catch (error) {
      console.error('Ransen remote HTTP broadcast failed', error);
      const socketResult = await channelRef.current?.send({ type: 'broadcast', event: 'command', payload });
      if (socketResult === 'ok') return resultPromise;
      pendingCommands.current.delete(commandId);
      return { ok: false, message: '指令发送失败，请重试' };
    }
    pendingCommands.current.delete(commandId);
    return { ok: false, message: '指令发送失败，请重试' };
  }, [roomId]);

  const startPublicGame = useCallback(async () => {
    const result = await sendCommand('on', '', true);
    if (result.ok) return result;

    // Another device may have opened the next lobby milliseconds earlier.
    // Treat that 409 as a join operation: read the authoritative deadline,
    // enter LOBBY locally, and request the latest Presence snapshot.
    const control = await callRansenControl('GET', undefined, roomId);
    if (control.ok && control.phase === GamePhase.LOBBY) {
      const clockShift = control.serverNow ? Date.now() - Date.parse(control.serverNow) : 0;
      const databaseDeadline = control.lobbyEndsAt ? Date.parse(control.lobbyEndsAt) + clockShift : Date.now();
      callbacks.current.onCommand('on', {
        serverState: true,
        lobbyEndsAt: databaseDeadline,
        arenaName: control.arenaName,
      });
      await channelRef.current?.send({
        type: 'broadcast',
        event: 'request_state',
        payload: { playerId: userId, requestedAt: Date.now(), reason: 'join_next_round' },
      });
      return { ok: true, message: '' };
    }
    if (control.ok && (control.phase === GamePhase.PLAYING || control.phase === GamePhase.THEATER)) {
      const stored = control.snapshot || {};
      const storedSlimes = Array.isArray(stored.slimes) ? stored.slimes : [];
      if (storedSlimes.length > 0) {
        const shift = control.serverNow ? Date.now() - Date.parse(control.serverNow) : 0;
        callbacks.current.onSnapshot({
          phase: control.phase,
          slimes: storedSlimes,
          encounters: control.phase === GamePhase.PLAYING
            ? normalizeEncounters(storedSlimes, Array.isArray(stored.encounters) ? stored.encounters : [], shift)
            : [],
          startedAt: typeof stored.startedAt === 'number' ? stored.startedAt + shift : null,
          lobbyEndsAt: null,
          arenaName: control.arenaName,
        });
        await channelRef.current?.send({
          type: 'broadcast',
          event: 'request_state',
          payload: { playerId: userId, requestedAt: Date.now(), reason: 'join_active_round' },
        });
        return { ok: true, message: '' };
      }
    }
    return result;
  }, [roomId, sendCommand, userId]);

  const sendInput = useCallback(async (x: number, y: number) => {
    if (!userId) return 'error';
    const channel = channelRef.current;
    const payload = { playerId: userId, x, y, inputId: crypto.randomUUID(), sentAt: Date.now() };
    // Apply the input with the canonical presence id immediately. The player
    // object can still contain its temporary id during the first render after
    // connecting, and `self: false` deliberately prevents a broadcast loop.
    callbacks.current.onInput(userId, x, y);
    if (!channel) return 'error';
    const result = await channel.send({ type: 'broadcast', event: 'input', payload });
    if (result === 'ok') return result;
    const fallback = await channel.httpSend('input', payload, { timeout: 5000 });
    return fallback.success ? 'ok' : 'error';
  }, [userId]);
  const sendVote = useCallback(async (encounterId: string, option: number) => {
    if (!userId || !channelRef.current) return 'error';
    const payload = { playerId: userId, encounterId, option, voteId: crypto.randomUUID(), sentAt: Date.now() };
    callbacks.current.onVote(userId, encounterId, option);
    const result = await channelRef.current.send({ type: 'broadcast', event: 'vote', payload });
    if (result === 'ok') return result;
    const fallback = await channelRef.current.httpSend('vote', payload, { timeout: 5000 });
    return fallback.success ? 'ok' : 'error';
  }, [userId]);
  const requestSnapshot = useCallback(async () => {
    if (!channelRef.current) return 'error';
    const payload = { playerId: userId, requestedAt: Date.now() };
    const result = await channelRef.current.send({ type: 'broadcast', event: 'request_state', payload });
    if (result !== 'ok') await channelRef.current.httpSend('request_state', payload, { timeout: 5000 });

    // A client waiting at lobby zero must not depend on an ephemeral host
    // response. Read the persisted authoritative round as a second path.
    try {
      const control = await callRansenControl('GET', undefined, roomId);
      if (control.ok && control.phase === GamePhase.PLAYING) {
        const stored = control.snapshot || {};
        const storedSlimes = Array.isArray(stored.slimes) ? stored.slimes : [];
        if (storedSlimes.length > 0) {
          const shift = control.serverNow ? Date.now() - Date.parse(control.serverNow) : 0;
          callbacks.current.onSnapshot({
            phase: GamePhase.PLAYING,
            slimes: storedSlimes,
            encounters: normalizeEncounters(storedSlimes, Array.isArray(stored.encounters) ? stored.encounters : [], shift),
            startedAt: typeof stored.startedAt === 'number' ? stored.startedAt + shift : null,
            lobbyEndsAt: null,
            arenaName: control.arenaName,
          });
          return 'ok';
        }
      }
    } catch (error) {
      console.error('Persistent snapshot request failed', error);
    }
    return result === 'ok' ? 'ok' : 'error';
  }, [roomId, userId]);
  const publishSnapshot = useCallback(async (snapshot: Snapshot) => {
    if (!channelRef.current) return 'error';
    const payload = { ...snapshot, serverNow: Date.now() };
    const result = await channelRef.current.send({ type: 'broadcast', event: 'state', payload });
    if (result === 'ok') return result;
    const fallback = await channelRef.current.httpSend('state', payload, { timeout: 5000 });
    return fallback.success ? 'ok' : 'error';
  }, []);

  return { userId, isHost, connection, onlinePlayers, sendCommand, startPublicGame, sendInput, sendVote, requestSnapshot, publishSnapshot };
}
