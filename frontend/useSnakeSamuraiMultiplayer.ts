import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ArenaState, GamePhase, MatchHistory, Player, SnakeState } from './types';
import { callSnakeSamuraiControl, registerSnakeSamuraiPlayer, supabase } from './supabase';

export type Snapshot = ArenaState;
type Connection = 'connecting' | 'online' | 'error';
export type CommandResult = { ok: boolean; message: string };
export type HistoryResult = { ok: boolean; message?: string; page: number; pageSize: number; total: number; totalPages: number; matches: MatchHistory[] };

interface Options {
  roomId: string;
  player: Player;
  phaseRef: React.MutableRefObject<GamePhase>;
  onCommand: (command: string, payload: Record<string, any>) => CommandResult | Promise<CommandResult>;
  onSnapshot: (snapshot: Snapshot, clockShift?: number) => void;
  onMoveIntent: (playerId: string, targetX: number, targetY: number) => void;
  onTailSpill: (victimId: string) => void;
  getSnapshot: () => Snapshot;
}

// Safe UUID generator that works on HTTP and HTTPS
function safeUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* fall through */ }
  // Fallback: generate a v4-like UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useSnakeSamuraiMultiplayer({ roomId, player, phaseRef, onCommand, onSnapshot, onMoveIntent, onTailSpill, getSnapshot }: Options) {
  const [userId, setUserId] = useState<string>();
  const [isHost, setIsHost] = useState(false);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [registrationError, setRegistrationError] = useState('');
  const [onlinePlayers, setOnlinePlayers] = useState<Player[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const hostRef = useRef(false);
  const callbacks = useRef({ onCommand, onSnapshot, onMoveIntent, onTailSpill, getSnapshot });
  callbacks.current = { onCommand, onSnapshot, onMoveIntent, onTailSpill, getSnapshot };

  // Connect ONCE on mount. Do NOT re-run when player.name/color changes.
  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const connect = async () => {
      try {
        const savedId = localStorage.getItem('kazeabc_device_id');
        const id = savedId || safeUUID();
        if (!savedId) localStorage.setItem('kazeabc_device_id', id);
        if (cancelled) return;
        setUserId(id);

        const control = await callSnakeSamuraiControl('GET', undefined, roomId);
        if (!cancelled && control.ok) {
          const shift = control.serverNow ? Date.now() - Date.parse(control.serverNow) : 0;
          if (control.phase === GamePhase.LOBBY) {
            callbacks.current.onCommand('on', {
              serverState: true,
              lobbyEndsAt: control.lobbyEndsAt ? Date.parse(control.lobbyEndsAt) + shift : null,
            });
          } else if ((control.phase === GamePhase.PLAYING || control.phase === GamePhase.THEATER) && control.snapshot?.snakes) {
            callbacks.current.onSnapshot({
              ...control.snapshot,
              phase: control.phase,
              startedAt: typeof control.snapshot.startedAt === 'number' ? control.snapshot.startedAt + shift : null,
              endsAt: typeof control.snapshot.endsAt === 'number' ? control.snapshot.endsAt + shift : null,
            } as Snapshot, shift);
          } else if (control.phase === GamePhase.OFF) {
            callbacks.current.onCommand('off', { serverState: true });
          }
        }

        channel = supabase.channel(`ransen:${roomId}`, {
          config: { broadcast: { self: false, ack: true }, presence: { key: id } }
        });

        channel
          .on('broadcast', { event: 'move_intent' }, ({ payload }) => {
            if (payload?.playerId && typeof payload.targetX === 'number' && typeof payload.targetY === 'number') {
              callbacks.current.onMoveIntent(payload.playerId, payload.targetX, payload.targetY);
            }
          })
          .on('broadcast', { event: 'snapshot' }, ({ payload }) => {
            if (payload?.snapshot) {
              const shift = typeof payload.sentAt === 'number' ? Date.now() - payload.sentAt : 0;
              callbacks.current.onSnapshot({
                ...payload.snapshot,
                startedAt: typeof payload.snapshot.startedAt === 'number' ? payload.snapshot.startedAt + shift : null,
                endsAt: typeof payload.snapshot.endsAt === 'number' ? payload.snapshot.endsAt + shift : null,
              }, shift);
            }
          })
          .on('broadcast', { event: 'tail_spill' }, ({ payload }) => {
            if (typeof payload?.victimId === 'string') callbacks.current.onTailSpill(payload.victimId);
          })
          .on('broadcast', { event: 'command' }, async ({ payload }) => {
            const result = await callbacks.current.onCommand(String(payload.command), payload);
            if (payload.commandId) await channel?.httpSend('command_result', { commandId: payload.commandId, ...result });
          })
          .on('broadcast', { event: 'request_snapshot' }, async () => {
            if (hostRef.current) {
              await channel?.send({ type: 'broadcast', event: 'snapshot', payload: { snapshot: callbacks.current.getSnapshot() } });
            }
          })
          .on('presence', { event: 'sync' }, () => {
            const state = channel?.presenceState() || {};
            const active: Player[] = [];
            const gameKeys: string[] = [];
            Object.entries(state).forEach(([key, presences]: [string, any]) => {
              presences.forEach((p: any) => {
                if (p.role === 'game' && p.player) {
                  active.push(p.player);
                  gameKeys.push(key);
                }
              });
            });
            setOnlinePlayers(active);

            // Host election: lowest key is host
            const keys = [...new Set(gameKeys)].sort();
            const amHost = keys[0] === id;
            setIsHost(amHost);
            hostRef.current = amHost;
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              setConnection('online');
              channel?.track({ player: { ...player, id }, role: 'game', onlineAt: new Date().toISOString() });
              if (phaseRef.current === GamePhase.LOBBY) {
                const registration = await registerSnakeSamuraiPlayer({ ...player, id }, roomId);
                setRegistrationError(registration.ok ? '' : registration.message || '无法登记本场玩家');
              }
              window.setTimeout(() => channel?.send({ type: 'broadcast', event: 'request_snapshot', payload: {} }), 250);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              setConnection('error');
            }
          });

        channelRef.current = channel;
      } catch (err) {
        console.error('Snake Samurai multiplayer connection failed', err);
        setConnection('error');
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]); // Only reconnect when roomId changes, NOT on player name/color changes

  // Update presence when player name/color changes (without reconnecting)
  useEffect(() => {
    if (channelRef.current && connection === 'online' && userId) {
      channelRef.current.track({ player: { ...player, id: userId }, role: 'game', onlineAt: new Date().toISOString() });
      if (phaseRef.current === GamePhase.LOBBY) void registerSnakeSamuraiPlayer({ ...player, id: userId }, roomId).then(result => setRegistrationError(result.ok ? '' : result.message || '无法登记本场玩家'));
    }
  }, [player.name, player.color, connection, userId, roomId, phaseRef]);

  useEffect(() => {
    if (connection !== 'online' || !userId || phaseRef.current !== GamePhase.LOBBY) return;
    const heartbeat = () => void registerSnakeSamuraiPlayer({ ...player, id: userId }, roomId).then(result => setRegistrationError(result.ok ? '' : result.message || '无法登记本场玩家'));
    heartbeat();
    const timer = window.setInterval(heartbeat, 5_000);
    return () => window.clearInterval(timer);
  }, [connection, userId, roomId, player.name, player.color, player.isSpectator, phaseRef]);

  const sendMoveIntent = useCallback((targetX: number, targetY: number) => {
    if (channelRef.current && connection === 'online') {
      channelRef.current.send({
        type: 'broadcast',
        event: 'move_intent',
        payload: { playerId: userId || player.id, targetX, targetY }
      });
    }
  }, [connection, userId, player.id]);

  const broadcastSnapshot = useCallback((snapshot: Snapshot) => {
    if (channelRef.current && connection === 'online' && hostRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'snapshot',
        payload: { snapshot, sentAt: Date.now() }
      });
    }
  }, [connection]);

  const broadcastTailSpill = useCallback((victimId: string) => {
    callbacks.current.onTailSpill(victimId);
    if (channelRef.current && connection === 'online') {
      channelRef.current.send({ type: 'broadcast', event: 'tail_spill', payload: { victimId, at: Date.now() } });
    }
  }, [connection]);

  const requestSnapshot = useCallback(() => {
    return channelRef.current?.send({ type: 'broadcast', event: 'request_snapshot', payload: {} });
  }, []);

  return {
    userId,
    isHost,
    connection,
    registrationError,
    onlinePlayers,
    requestSnapshot,
    sendMoveIntent,
    broadcastSnapshot,
    broadcastTailSpill,
  };
}
