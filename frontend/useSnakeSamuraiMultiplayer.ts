import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ArenaState, GamePhase, MatchHistory, Player, SnakeState } from './types';
import { callSnakeSamuraiControl, supabase } from './supabase';

export type Snapshot = ArenaState;
type Connection = 'connecting' | 'online' | 'error';
export type CommandResult = { ok: boolean; message: string };
export type HistoryResult = { ok: boolean; message?: string; page: number; pageSize: number; total: number; totalPages: number; matches: MatchHistory[] };

interface Options {
  roomId: string;
  player: Player;
  phaseRef: React.MutableRefObject<GamePhase>;
  onCommand: (command: string, payload: Record<string, any>) => CommandResult;
  onSnapshot: (snapshot: Snapshot) => void;
  onMoveIntent: (playerId: string, targetX: number, targetY: number) => void;
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

export function useSnakeSamuraiMultiplayer({ roomId, player, phaseRef, onCommand, onSnapshot, onMoveIntent, getSnapshot }: Options) {
  const [userId, setUserId] = useState<string>();
  const [isHost, setIsHost] = useState(false);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [onlinePlayers, setOnlinePlayers] = useState<Player[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const hostRef = useRef(false);
  const callbacks = useRef({ onCommand, onSnapshot, onMoveIntent, getSnapshot });
  callbacks.current = { onCommand, onSnapshot, onMoveIntent, getSnapshot };

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

        // Only fetch server state if we are currently in LOBBY phase.
        // This prevents kicking users out of PLAYING back to LOBBY.
        if (phaseRef.current === GamePhase.LOBBY) {
          const control = await callSnakeSamuraiControl('GET', undefined, roomId);
          if (!cancelled && control.ok && control.phase === GamePhase.LOBBY && phaseRef.current === GamePhase.LOBBY) {
            callbacks.current.onCommand('on', { serverState: true, lobbyEndsAt: control.lobbyEndsAt });
          }
        }

        channel = supabase.channel(`snake-samurai:${roomId}`, {
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
              callbacks.current.onSnapshot(payload.snapshot);
            }
          })
          .on('presence', { event: 'sync' }, () => {
            const state = channel?.presenceState() || {};
            const active: Player[] = [];
            Object.values(state).forEach((presences: any) => {
              presences.forEach((p: any) => {
                if (p.player) active.push(p.player);
              });
            });
            setOnlinePlayers(active);

            // Host election: lowest key is host
            const keys = Object.keys(state).sort();
            const amHost = keys[0] === id;
            setIsHost(amHost);
            hostRef.current = amHost;
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              setConnection('online');
              channel?.track({ player: { ...player, id }, onlineAt: new Date().toISOString() });
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
      channelRef.current.track({ player: { ...player, id: userId }, onlineAt: new Date().toISOString() });
    }
  }, [player.name, player.color, connection, userId]);

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
        payload: { snapshot }
      });
    }
  }, [connection]);

  return {
    userId,
    isHost,
    connection,
    onlinePlayers,
    sendMoveIntent,
    broadcastSnapshot
  };
}
