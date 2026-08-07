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
  onCommand: (command: string, payload: Record<string, any>) => CommandResult;
  onSnapshot: (snapshot: Snapshot) => void;
  onMoveIntent: (playerId: string, targetX: number, targetY: number) => void;
  getSnapshot: () => Snapshot;
}

export function useSnakeSamuraiMultiplayer({ roomId, player, onCommand, onSnapshot, onMoveIntent, getSnapshot }: Options) {
  const [userId, setUserId] = useState<string>();
  const [isHost, setIsHost] = useState(false);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [onlinePlayers, setOnlinePlayers] = useState<Player[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const hostRef = useRef(false);
  const callbacks = useRef({ onCommand, onSnapshot, onMoveIntent, getSnapshot });
  callbacks.current = { onCommand, onSnapshot, onMoveIntent, getSnapshot };

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const connect = async () => {
      try {
        const savedId = localStorage.getItem('kazeabc_device_id');
        const id = savedId || crypto.randomUUID();
        if (!savedId) localStorage.setItem('kazeabc_device_id', id);
        if (cancelled) return;
        setUserId(id);

        const control = await callSnakeSamuraiControl('GET', undefined, roomId);
        if (control.ok && control.phase === GamePhase.LOBBY) {
          callbacks.current.onCommand('on', { serverState: true, lobbyEndsAt: control.lobbyEndsAt });
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
  }, [roomId, player.id, player.name, player.color]);

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
