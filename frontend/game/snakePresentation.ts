import type { ArenaBounds, SnakeState } from '../types.ts';
import { calculateSnakeSpeed } from './snakeMovement.ts';

type Point = { x: number; y: number };
const WINDOW = 150;
const CORRECTION = 80;
const MAX_PREDICTION = 300;
const SAMPLE_MARGIN = 50;
const INPUT_EXPIRY = 500;
const mix = (a: Point, b: Point, amount: number) => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount });
const lifecycle = (snake: SnakeState) => JSON.stringify([
  snake.playerId, snake.connected, snake.earnedLength, snake.totalLength, snake.bodyPath.length,
  snake.heldFoods.map(item => item.foodId), snake.invulnerableUntil ?? null, snake.onBoundary ?? false,
]);

export function findDisplayPlayerSnake(snakes: Record<string, SnakeState>, playerId: string) {
  return snakes['snake-' + playerId] || Object.values(snakes).find(snake => snake.playerId === playerId);
}
export function snakeDisplayWorldPoint(x: number, y: number, width: number, height: number, zoom: number, camera: Point) {
  return { x: (x - width / 2) / zoom + camera.x, y: (y - height / 2) / zoom + camera.y };
}
function translate(snake: SnakeState, dx: number, dy: number): SnakeState {
  return { ...snake, head: { x: snake.head.x + dx, y: snake.head.y + dy },
    bodyPath: snake.bodyPath.map(point => ({ x: point.x + dx, y: point.y + dy })),
    heldFoods: snake.heldFoods.map(item => ({ ...item,
      ...(item.x === undefined ? {} : { x: item.x + dx }),
      ...(item.y === undefined ? {} : { y: item.y + dy }),
    })) };
}
/** Only free head movement and main's 14px path geometry; no collisions or items. */
function predict(base: SnakeState, elapsed: number, bounds: ArenaBounds, target: Point, horizon: number): SnakeState {
  const speed = calculateSnakeSpeed(base.earnedLength, base.heldFoods.length);
  const dx = target.x - base.head.x, dy = target.y - base.head.y, distance = Math.hypot(dx, dy);
  const seconds = Math.min(horizon, Math.max(0, elapsed)) / 1000;
  // Display prediction must stop at its target even with a longer sample window.
  const travel = distance > 5 ? Math.min(distance, speed * seconds) : 0;
  const direction = distance > 5 ? { x: dx / distance, y: dy / distance } : base.direction;
  const head = {
    x: Math.max(bounds.minX + 15, Math.min(bounds.maxX - 15, base.head.x + direction.x * travel)),
    y: Math.max(bounds.minY + 15, Math.min(bounds.maxY - 15, base.head.y + direction.y * travel)),
  };
  const moved = translate(base, head.x - base.head.x, head.y - base.head.y);
  const bodyPath: Point[] = [head];
  const totalNodesNeeded = Math.max(9, 9 + base.earnedLength * 3);
  for (let index = 1; index < totalNodesNeeded; index++) {
    const previous = bodyPath[index - 1], existing = base.bodyPath[index];
    if (existing) {
      const pathX = existing.x - previous.x, pathY = existing.y - previous.y;
      const length = Math.hypot(pathX, pathY);
      bodyPath.push(length > .001
        ? { x: previous.x + pathX / length * 14, y: previous.y + pathY / length * 14 }
        : { x: previous.x - direction.x * 14, y: previous.y - direction.y * 14 });
    } else bodyPath.push({ x: previous.x - direction.x * 14, y: previous.y - direction.y * 14 });
  }
  return { ...moved, head, direction, bodyPath };
}
interface Entry {
  base: SnakeState; from: SnakeState; observedAt: number; lifecycle: string;
  sourceHead: Point; sourceTarget: Point; source: SnakeState; correction: Point; stationary: boolean;
  lastAuthorityAt: number; horizon: number; authorityTarget: Point; frozen?: SnakeState;
}
export function createSnakePresentation() {
  const entries = new Map<string, Entry>();
  const pending = new Map<string, { target: Point; issuedAt: number }>();
  let bounds: ArenaBounds = { minX: 0, maxX: 2000, minY: 0, maxY: 2000 };
  let identity: string | undefined;
  const pose = (entry: Entry, playerId: string | undefined, time: number): SnakeState => {
    const elapsed = Math.max(0, time - entry.observedAt);
    if (entry.base.playerId === playerId && !entry.stationary) {
      const intent = pending.get(entry.base.id);
      const deadline = entry.lastAuthorityAt + entry.horizon;
      const poseTime = Math.min(time, deadline);
      const target = intent && poseTime - intent.issuedAt < INPUT_EXPIRY ? intent.target : entry.authorityTarget;
      if (intent && time - intent.issuedAt >= INPUT_EXPIRY) pending.delete(entry.base.id);
      if (entry.frozen && time >= deadline) return entry.frozen;
      // Pointer rebasing cannot move the persistent authority deadline.
      const remaining = Math.max(0, entry.lastAuthorityAt + entry.horizon - entry.observedAt);
      const poseElapsed = Math.max(0, poseTime - entry.observedAt);
      const predicted = predict(entry.base, poseElapsed, bounds, target, remaining);
      const weight = Math.max(0, 1 - poseElapsed / CORRECTION);
      const corrected = translate(predicted, entry.correction.x * weight, entry.correction.y * weight);
      const x = Math.max(bounds.minX + 15, Math.min(bounds.maxX - 15, corrected.head.x));
      const y = Math.max(bounds.minY + 15, Math.min(bounds.maxY - 15, corrected.head.y));
      const displayed = translate(corrected, x - corrected.head.x, y - corrected.head.y);
      if (time >= deadline) entry.frozen = displayed;
      return displayed;
    }
    if (entry.stationary) return entry.base;
    const amount = Math.min(1, elapsed / WINDOW);
    const head = mix(entry.from.head, entry.base.head, amount);
    return { ...entry.base, head,
      direction: mix(entry.from.direction, entry.base.direction, amount),
      bodyPath: entry.base.bodyPath.map((point, index) => mix(entry.from.bodyPath[index] || point, point, amount)),
      heldFoods: entry.base.heldFoods.map((item, index) => {
        const previous = entry.from.heldFoods[index];
        return previous?.foodId === item.foodId && previous.x !== undefined && previous.y !== undefined && item.x !== undefined && item.y !== undefined
          ? { ...item, ...mix({ x: previous.x, y: previous.y }, { x: item.x, y: item.y }, amount) } : item;
      }),
    };
  };
  return {
    reset(id?: string) { if (id) { entries.delete(id); pending.delete(id); } else { entries.clear(); pending.clear(); identity = undefined; } },
    observe(snakes: Record<string, SnakeState>, currentBounds: ArenaBounds, playerId: string | undefined, time: number) {
      if (identity !== playerId) { entries.clear(); pending.clear(); identity = playerId; }
      bounds = currentBounds;
      const ids = new Set(Object.values(snakes).filter(snake => snake.connected).map(snake => snake.id));
      for (const id of entries.keys()) if (!ids.has(id)) { entries.delete(id); pending.delete(id); }
      for (const snake of Object.values(snakes)) {
        if (!snake.connected) continue;
        const old = entries.get(snake.id), nextLife = lifecycle(snake);
        const reset = !old || old.lifecycle !== nextLife;
        const sameHead = old && old.sourceHead.x === snake.head.x && old.sourceHead.y === snake.head.y;
        const sameTarget = old && old.sourceTarget.x === snake.target.x && old.sourceTarget.y === snake.target.y;
        if (!reset && old.source === snake && sameHead && sameTarget) continue;
        // App's optimistic {...snake, target} retains geometry references;
        // authenticated snapshots are deep copies, including stopped positions.
        const localTargetOnly = !reset && sameHead
          && old.source.head === snake.head && old.source.bodyPath === snake.bodyPath;
        if (localTargetOnly) {
          // Local target feedback is not a new authoritative head/body position.
          old.base = { ...snake, head: old.base.head, bodyPath: old.base.bodyPath, direction: old.base.direction, heldFoods: old.base.heldFoods };
          old.source = snake; old.sourceTarget = { ...snake.target };
          continue;
        }
        const previous = reset ? snake : pose(old, playerId, time);
        if (reset) pending.delete(snake.id);
        const intent = pending.get(snake.id);
        const confirmed = Boolean(intent && intent.target.x === snake.target.x && intent.target.y === snake.target.y);
        if (confirmed || intent && time - intent.issuedAt >= INPUT_EXPIRY) pending.delete(snake.id);
        // A fresh authority sample with an unchanged head is a display stop,
        // never a client collision calculation or a write to gameplay state.
        const stationary = Boolean(!reset && sameHead && !pending.has(snake.id) && (sameTarget || confirmed));
        entries.set(snake.id, { base: snake, from: previous, source: snake,
          sourceHead: { ...snake.head }, sourceTarget: { ...snake.target }, lifecycle: nextLife,
          observedAt: time, stationary, lastAuthorityAt: time,
          horizon: reset ? WINDOW : Math.min(MAX_PREDICTION, Math.max(WINDOW, time - old.lastAuthorityAt + SAMPLE_MARGIN)),
          authorityTarget: { ...snake.target },
          correction: !reset && !stationary && snake.playerId === playerId
            ? { x: previous.head.x - snake.head.x, y: previous.head.y - snake.head.y } : { x: 0, y: 0 } });
      }
    },
    input(playerId: string, target: Point, time: number) {
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return false;
      const entry = [...entries.values()].find(item => item.base.playerId === playerId && item.base.connected && !item.base.isBot);
      if (!entry || time >= entry.lastAuthorityAt + entry.horizon) return false;
      const displayed = pose(entry, playerId, time);
      entry.base = displayed; entry.from = displayed; entry.observedAt = time; entry.stationary = false; entry.correction = { x: 0, y: 0 };
      pending.set(entry.base.id, { target: { ...target }, issuedAt: time });
      return true;
    },
    frame(playerId: string | undefined, time: number): Record<string, SnakeState> {
      return Object.fromEntries([...entries].map(([id, entry]) => [id, pose(entry, playerId, time)]));
    },
  };
}
