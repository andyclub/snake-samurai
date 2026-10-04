type HostFrame = {
  type: string;
  room: string;
  fence: number;
  seq: number;
  serverNow: number;
  playerId?: string;
  snapshot?: any;
  questions?: any[];
  action?: any;
};

type SendIntent = (intent: Record<string, unknown>) => Promise<unknown> | unknown;
type WorkerLike = {
  onmessage: ((event: { data: any }) => void) | null;
  onerror: ((event: any) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
};
type SnapshotWaiter = { resolve: (accepted: boolean) => void };
type SnapshotQueue = { snapshot: any; waiters: SnapshotWaiter[] };
type PlayerHostRoom = {
  roomId: string;
  playerId: string;
  fence: number;
  matchId: string;
  phase: string;
  worker: WorkerLike;
  sendIntent: SendIntent;
  active: boolean;
  latestSnapshot?: SnapshotQueue;
  snapshotFlight?: Promise<void>;
};

const PLAYER_ROOMS = new Set(['snake-free', 'snake-theme', 'snake-disaster']);
const activeRooms = new Map<string, PlayerHostRoom>();
let nextWarningAt = -Infinity;
function warnFailure(code: string) {
  const current = performance.now();
  if (current < nextWarningAt) return;
  nextWarningAt = current + 30_000;
  console.warn('Player host runtime operation failed', code);
}

const isRecord = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const validPlayerId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 160;
const validFence = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;
const isGameSnapshot = (value: unknown): value is Record<string, any> =>
  isRecord(value) && ['PLAYING', 'THEATER'].includes(value.phase)
  && typeof value.matchId === 'string' && value.matchId.length > 0;
const isPlayingSnapshot = (value: unknown): value is Record<string, any> =>
  isGameSnapshot(value) && value.phase === 'PLAYING';
const intentAccepted = (result: unknown) =>
  result === true || result === 'ok' || isRecord(result) && result.ok === true;

function drainSnapshots(entry: PlayerHostRoom): Promise<void> {
  if (entry.snapshotFlight) return entry.snapshotFlight;
  let failed = false;
  const flight = (async () => {
    while (entry.active && entry.latestSnapshot) {
      const current = entry.latestSnapshot;
      entry.latestSnapshot = undefined;
      let accepted = false;
      try {
        accepted = intentAccepted(await entry.sendIntent({
          type: 'host_snapshot',
          fencingToken: entry.fence,
          snapshot: current.snapshot,
        }));
      } catch {
        accepted = false;
      }
      if (!entry.active) {
        current.waiters.forEach(waiter => waiter.resolve(false));
        break;
      }
      if (accepted) {
        current.waiters.forEach(waiter => waiter.resolve(true));
        continue;
      }
      warnFailure('snapshot_not_accepted');
      if (entry.latestSnapshot) {
        entry.latestSnapshot.waiters.unshift(...current.waiters);
      } else {
        entry.latestSnapshot = current;
      }
      failed = true;
      break;
    }
  })().finally(() => {
    entry.snapshotFlight = undefined;
    // A failed item waits for the next worker frame before retrying, avoiding
    // a tight loop while preserving one in-flight snapshot at a time.
    if (entry.active && entry.latestSnapshot && !failed) void drainSnapshots(entry);
  });
  entry.snapshotFlight = flight;
  return flight;
}

function publishSnapshot(entry: PlayerHostRoom, snapshot: unknown): Promise<boolean> {
  if (!entry.active || !isGameSnapshot(snapshot)) return Promise.resolve(false);
  return new Promise(resolve => {
    if (entry.latestSnapshot) {
      entry.latestSnapshot.snapshot = structuredClone(snapshot);
      entry.latestSnapshot.waiters.push({ resolve });
    } else {
      entry.latestSnapshot = { snapshot: structuredClone(snapshot), waiters: [{ resolve }] };
    }
    if (!entry.snapshotFlight) void drainSnapshots(entry);
  });
}

function stopEntry(roomId: string) {
  const entry = activeRooms.get(roomId);
  if (!entry) return;
  activeRooms.delete(roomId);
  entry.active = false;
  entry.latestSnapshot?.waiters.forEach(waiter => waiter.resolve(false));
  entry.latestSnapshot = undefined;
  entry.worker.onmessage = null;
  entry.worker.onerror = null;
  entry.worker.terminate();
}

async function requestWordValidation(entry: PlayerHostRoom, actorId: string, snapshot: any) {
  const snake = Object.values(snapshot?.snakes || {}).find((value: any) =>
    value?.playerId === actorId && !value.isBot,
  ) as { heldFoods?: Array<{ foodId?: unknown }> } | undefined;
  const heldFoodIds = snake?.heldFoods?.map(food => food.foodId);
  if (!Array.isArray(heldFoodIds) || heldFoodIds.some(id => typeof id !== 'string')) {
    warnFailure('validation_state_unavailable');
    return;
  }
  // The server must first accept the current state; only then may it validate
  // the server-derived held glyphs and return a trusted_word_validation action.
  if (!await publishSnapshot(entry, snapshot) || !entry.active) return;
  try {
    const accepted = intentAccepted(await entry.sendIntent({
      type: 'host_validate',
      fencingToken: entry.fence,
      playerId: actorId,
      heldFoodIds,
    }));
    if (!accepted) warnFailure('validation_not_accepted');
  } catch { warnFailure('validation_send_failed'); }
}

function dispatchHostAction(roomId: string, playerId: string, frame: HostFrame): boolean {
  const entry = activeRooms.get(roomId);
  if (!entry || !entry.active || entry.playerId !== playerId || entry.phase !== 'PLAYING'
    || frame.room !== roomId || frame.fence !== entry.fence || !Number.isFinite(frame.serverNow)
    || !validPlayerId(frame.playerId) || !isRecord(frame.action)
    || typeof frame.action.type !== 'string') return false;
  entry.worker.postMessage({
    type: 'action',
    fence: entry.fence,
    playerId: frame.playerId,
    action: structuredClone(frame.action),
  });
  return true;
}

/** Call only for an already authenticated, designated player host frame. */
export function acceptPlayerHostFrame({
  roomId,
  playerId,
  frame,
  sendIntent,
}: {
  roomId: string;
  playerId: string;
  frame: HostFrame;
  sendIntent: SendIntent;
}): boolean {
  if (!PLAYER_ROOMS.has(roomId) || !validPlayerId(playerId) || !isRecord(frame)) return false;
  if (frame.type === 'host_action') return dispatchHostAction(roomId, playerId, frame);
  if (typeof sendIntent !== 'function' || frame.type !== 'host_grant' || frame.room !== roomId
    || frame.playerId !== playerId || !validFence(frame.fence) || !Number.isFinite(frame.serverNow)
    || !isPlayingSnapshot(frame.snapshot) || !Array.isArray(frame.questions)) return false;

  const current = activeRooms.get(roomId);
  if (current) {
    if (frame.fence < current.fence) return false;
    if (frame.fence === current.fence) {
      if (frame.playerId !== current.playerId) return false;
      if (frame.snapshot.matchId === current.matchId) {
        current.sendIntent = sendIntent;
        return true;
      }
    }
    stopEntry(roomId);
  }

  let worker: WorkerLike;
  try {
    worker = new Worker(new URL('./playerHostWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch {
    warnFailure('worker_start_failed');
    return false;
  }
  const entry: PlayerHostRoom = {
    roomId,
    playerId,
    fence: frame.fence,
    matchId: frame.snapshot.matchId,
    phase: frame.snapshot.phase,
    worker,
    sendIntent,
    active: true,
  };
  activeRooms.set(roomId, entry);
  worker.onmessage = ({ data }) => {
    if (!entry.active || activeRooms.get(roomId) !== entry || !isRecord(data)) return;
    if (data.fence !== undefined && data.fence !== entry.fence) return;
    if (data.type === 'snapshot') {
      if (data.changed !== true && !data.endReason) return;
      if (isGameSnapshot(data.snapshot)) entry.phase = data.snapshot.phase;
      void publishSnapshot(entry, data.snapshot);
      return;
    }
    if (data.type !== 'action_result') return;
    if (data.result === false || data.result?.ok === false && data.result?.code !== 'requires_validation') {
      warnFailure('engine_action_rejected');
    }
    if (data.result?.code === 'requires_validation' && validPlayerId(data.playerId)) {
      void requestWordValidation(entry, data.playerId, data.snapshot);
    } else if (isGameSnapshot(data.snapshot)) {
      entry.phase = data.snapshot.phase;
      if (data.actionType !== 'input' && data.changed === true) void publishSnapshot(entry, data.snapshot);
    } else if (data.snapshot?.phase) {
      entry.phase = data.snapshot.phase;
    }
  };
  worker.onerror = () => { warnFailure('worker_runtime_failed'); stopEntry(roomId); };
  worker.postMessage({
    type: 'init',
    roomId,
    playerId,
    fence: frame.fence,
    serverNow: frame.serverNow,
    snapshot: structuredClone(frame.snapshot),
    questions: structuredClone(frame.questions),
  });
  return true;
}

/** Stop only the room's explicitly granted local worker. */
export function stopPlayerHostRoom(roomId: string): void {
  stopEntry(roomId);
}
