import { useCallback, useEffect, useRef, useState } from 'react';
import { ArenaState, GamePhase, Player } from './types';
import { getHostIdentity, sendHostIntent, subscribeHost } from './hostTransport';

export type Snapshot = ArenaState & { lobbyEndsAt?: number | null };
type Connection = 'connecting' | 'online' | 'error';
export type CommandResult = { ok: boolean; message: string };

interface Options {
  roomId: string;
  player: Player;
  onSnapshot: (snapshot: Snapshot, clockShift?: number) => void;
  onTailSpill: (victimId: string) => void;
}

const noBroadcast = (_payload?: unknown) => undefined;

export function useSnakeSamuraiMultiplayer({ roomId, player, onSnapshot, onTailSpill }: Options) {
  const [userId, setUserId] = useState<string>();
  const [connection, setConnection] = useState<Connection>('connecting');
  const [registrationError, setRegistrationError] = useState('');
  const [onlinePlayers, setOnlinePlayers] = useState<Player[]>([]);
  const callbacks = useRef({ onSnapshot, onTailSpill });
  callbacks.current = { onSnapshot, onTailSpill };
  const mounted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    let firstClockShift: number | undefined;
    let previous: Snapshot | undefined;
    setOnlinePlayers([]);
    const unsubscribe = subscribeHost(roomId, frame => {
      if (cancelled) return;
      if (firstClockShift === undefined) firstClockShift = Date.now() - frame.serverNow;
      const canonical = frame.snapshot as unknown as Snapshot;
      const snapshot: Snapshot = {
        ...canonical,
        startedAt: typeof canonical.startedAt === 'number' ? canonical.startedAt + firstClockShift : null,
        endsAt: typeof canonical.endsAt === 'number' ? canonical.endsAt + firstClockShift : null,
        lobbyEndsAt: typeof canonical.lobbyEndsAt === 'number' ? canonical.lobbyEndsAt + firstClockShift : null,
      };
      setOnlinePlayers(frame.players as Player[]);
      callbacks.current.onSnapshot(snapshot, firstClockShift);
      // A settlement consumes the mouth too. Only continuing, connected snakes
      // in the same live round with no new completion can produce a spill view.
      if (previous?.phase === GamePhase.PLAYING && canonical.phase === GamePhase.PLAYING
        && previous.startedAt === canonical.startedAt) {
        for (const [id, snake] of Object.entries(canonical.snakes || {})) {
          const old = previous.snakes?.[id];
          if (old?.connected && snake.connected && old.heldFoods.length > snake.heldFoods.length
            && old.completionHistory.length === snake.completionHistory.length) callbacks.current.onTailSpill(id);
        }
      }
      previous = canonical;
    }, status => { if (!cancelled) setConnection(status); });
    void getHostIdentity().then(identity => {
      if (!cancelled) setUserId(identity.playerId);
    }).catch(error => {
      console.error('Snake guest session failed', error);
      if (!cancelled) setConnection('error');
    });
    return () => {
      cancelled = true;
      mounted.current = false;
      unsubscribe();
    };
  }, [roomId]);

  // Editing a profile never enrolls a spectator. Reconnect sends only profile.
  useEffect(() => {
    if (connection !== 'online' || !userId) return;
    let cancelled = false;
    void sendHostIntent(roomId, { type: 'profile', name: player.name, color: player.color })
      .then(result => { if (!cancelled) setRegistrationError(result === 'ok' ? '' : '无法更新玩家资料'); });
    return () => { cancelled = true; };
  }, [roomId, connection, userId, player.name, player.color]);

  const joinMatch = useCallback(async (isSpectator: boolean) => {
    const result = await sendHostIntent(roomId, { type: 'join', name: player.name, color: player.color, isSpectator });
    if (mounted.current) setRegistrationError(result === 'ok' ? '' : '无法登记本场玩家');
    return result;
  }, [roomId, player.name, player.color]);

  const sendMoveIntent = useCallback((targetX: number, targetY: number) =>
    sendHostIntent(roomId, { type: 'input', targetX, targetY }), [roomId]);
  const sendIntent = useCallback((body: Record<string, unknown>) => sendHostIntent(roomId, body), [roomId]);
  const requestSnapshot = useCallback(() => sendHostIntent(roomId, { type: 'request_state' }), [roomId]);
  const isJoined = onlinePlayers.some(member => member.id === userId && !member.isBot && !member.isSpectator);

  return {
    userId, isHost: false, isJoined, connection, registrationError, onlinePlayers,
    joinMatch, sendIntent, requestSnapshot, sendMoveIntent,
    // Legacy physics remains guarded off. Browser state is never published.
    broadcastSnapshot: noBroadcast,
    broadcastTailSpill: noBroadcast,
  };
}
