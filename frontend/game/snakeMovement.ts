import { ArenaBounds, BodyPoint, SnakeState } from '../types';

export const BASE_SPEED = 180; // pixels per second
export const MIN_SPEED_RATIO = 0.35;

export function calculateSnakeSpeed(earnedLengthUnits: number): number {
  const speed = BASE_SPEED * Math.pow(0.91, earnedLengthUnits);
  return Math.max(BASE_SPEED * MIN_SPEED_RATIO, speed);
}

export function updateSnakePosition(
  snake: SnakeState,
  deltaTimeSeconds: number,
  bounds: ArenaBounds,
  allSnakes: Record<string, SnakeState> = {}
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

  // SOLID PHYSICAL BODY COLLISION (Cannot pass through other snakes' main body or self body)
  // NOTE: Exclude the last 5 tail nodes of enemy snakes so head can reach tail for battle attacks!
  const collisionRadius = 26;
  let isBlocked = false;

  for (const otherId of Object.keys(allSnakes)) {
    const otherSnake = allSnakes[otherId];
    if (!otherSnake || !otherSnake.connected) continue;

    const path = otherSnake.bodyPath;
    const startIndex = (otherId === snake.id) ? 6 : 0;
    // Exclude tail nodes (last 5 nodes) from solid block so attacker head can reach tail
    const endIndex = (otherId === snake.id) ? path.length : Math.max(0, path.length - 5);

    for (let i = startIndex; i < endIndex; i++) {
      const node = path[i];
      const d = Math.hypot(nextX - node.x, nextY - node.y);
      if (d < collisionRadius) {
        isBlocked = true;
        break;
      }
    }
    if (isBlocked) break;
  }

  if (isBlocked) {
    // Stop forward movement into the solid obstacle body
    nextX = snake.head.x;
    nextY = snake.head.y;
  }

  const newHead = { x: nextX, y: nextY };
  const newDirection = dist > 5 ? { x: vx / speed, y: vy / speed } : snake.direction;

  // Update body path using continuous distance-constraint kinematics (Nodes NEVER collapse!)
  const segmentDistance = 14;
  const totalNodesNeeded = Math.max(9, 9 + snake.earnedLength * 3);

  const updatedPath: BodyPoint[] = [newHead];
  for (let i = 1; i < totalNodesNeeded; i++) {
    const prevNode = updatedPath[i - 1];
    const existingNode = snake.bodyPath[i];

    if (existingNode) {
      const dx = existingNode.x - prevNode.x;
      const dy = existingNode.y - prevNode.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        updatedPath.push({
          x: prevNode.x + (dx / d) * segmentDistance,
          y: prevNode.y + (dy / d) * segmentDistance
        });
      } else {
        updatedPath.push({
          x: prevNode.x - newDirection.x * segmentDistance,
          y: prevNode.y - newDirection.y * segmentDistance
        });
      }
    } else {
      updatedPath.push({
        x: prevNode.x - newDirection.x * segmentDistance,
        y: prevNode.y - newDirection.y * segmentDistance
      });
    }
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

export function calculateCameraZoom(totalLength?: number): number {
  const len = (typeof totalLength === 'number' && Number.isFinite(totalLength)) ? totalLength : 3;
  const targetZoom = 1.55 / (1.0 + Math.log10(1 + Math.max(0, len) * 0.05));
  const zoom = Math.max(0.85, Math.min(1.55, targetZoom));
  return Number.isFinite(zoom) ? zoom : 1.2;
}
