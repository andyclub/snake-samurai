import { ArenaBounds, BodyPoint, BodySegment, SnakeState } from '../types';

export const BASE_SPEED = 180; // pixels per second
export const MIN_SPEED_RATIO = 0.35;

export function calculateSnakeSpeed(earnedLengthUnits: number): number {
  const speed = BASE_SPEED * Math.pow(0.91, earnedLengthUnits);
  return Math.max(BASE_SPEED * MIN_SPEED_RATIO, speed);
}

export function updateSnakePosition(
  snake: SnakeState,
  deltaTimeSeconds: number,
  bounds: ArenaBounds
): SnakeState {
  const speed = calculateSnakeSpeed(snake.earnedLength);
  const dx = snake.target.x - snake.head.x;
  const dy = snake.target.y - snake.head.y;
  const dist = Math.hypot(dx, dy);

  let vx = 0;
  let vy = 0;
  if (dist > 5) {
    vx = (dx / dist) * speed;
    vy = (dy / dist) * speed;
  }

  let nextX = snake.head.x + vx * deltaTimeSeconds;
  let nextY = snake.head.y + vy * deltaTimeSeconds;
  let onBoundary = false;

  // Boundary magnetic snap logic
  const minX = bounds.minX + 15;
  const maxX = bounds.maxX - 15;
  const minY = bounds.minY + 15;
  const maxY = bounds.maxY - 15;

  if (nextX <= minX) { nextX = minX; onBoundary = true; }
  if (nextX >= maxX) { nextX = maxX; onBoundary = true; }
  if (nextY <= minY) { nextY = minY; onBoundary = true; }
  if (nextY >= maxY) { nextY = maxY; onBoundary = true; }

  const newHead = { x: nextX, y: nextY };
  const newDirection = dist > 5 ? { x: vx / speed, y: vy / speed } : snake.direction;

  // Update body path (history of head positions)
  const segmentDistance = 14; // Distance between body nodes
  const totalNodesNeeded = Math.max(3, 3 + snake.totalLength * 2);

  const updatedPath: BodyPoint[] = [newHead];
  let currentPos = newHead;

  for (let i = 1; i < snake.bodyPath.length && updatedPath.length < totalNodesNeeded; i++) {
    const prev = snake.bodyPath[i - 1];
    const curr = snake.bodyPath[i];
    const segDist = Math.hypot(curr.x - prev.x, curr.y - prev.y);

    if (Math.hypot(currentPos.x - curr.x, currentPos.y - curr.y) >= segmentDistance) {
      updatedPath.push(curr);
      currentPos = curr;
    }
  }

  while (updatedPath.length < totalNodesNeeded && updatedPath.length > 0) {
    const last = updatedPath[updatedPath.length - 1];
    updatedPath.push({ x: last.x - newDirection.x * segmentDistance, y: last.y - newDirection.y * segmentDistance });
  }

  return {
    ...snake,
    head: newHead,
    direction: newDirection,
    bodyPath: updatedPath,
    currentSpeed: speed,
    onBoundary
  };
}

export function calculateCameraZoom(totalLength: number): number {
  // Short snake -> zoom 1.0, long snake -> zoom out smoothly to min 0.55
  const targetZoom = 1.0 / (1.0 + Math.log10(1 + totalLength * 0.08));
  return Math.max(0.55, Math.min(1.0, targetZoom));
}
