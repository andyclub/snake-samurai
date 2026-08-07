import { ArenaBounds, BodyPoint, SnakeState } from '../types';

export const BASE_SPEED = 180; // pixels per second
export const MIN_SPEED_RATIO = 0.35;

// Global map to track sticking duration between pairs of snakes to prevent lockups (>5s auto bounce apart)
const stickingMap = new Map<string, number>();

export function calculateSnakeSpeed(earnedLengthUnits: number, heldFoodCount: number = 0): number {
  const baseSpeedReduction = Math.pow(0.91, earnedLengthUnits);
  const heldFoodReduction = Math.pow(0.97, heldFoodCount); // 3% slower per held food
  const speed = BASE_SPEED * baseSpeedReduction * heldFoodReduction;
  return Math.max(BASE_SPEED * MIN_SPEED_RATIO, speed);
}

export function updateSnakePosition(
  snake: SnakeState,
  deltaTimeSeconds: number,
  bounds: ArenaBounds,
  allSnakes: Record<string, SnakeState> = {}
): SnakeState {
  const speed = calculateSnakeSpeed(snake.earnedLength, snake.heldFoods.length);
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

  // SOLID PHYSICAL BODY COLLISION
  // Rule 1: A snake IGNORES its own body collision when U-turning/turning around!
  // Rule 2: 5-second anti-lockup bounce when stuck with an enemy snake!
  const collisionRadius = 26;
  let isBlocked = false;
  const now = Date.now();

  for (const otherId of Object.keys(allSnakes)) {
    if (otherId === snake.id) continue; // IGNORE SELF-COLLISION for smooth U-turns!

    const otherSnake = allSnakes[otherId];
    if (!otherSnake || !otherSnake.connected) continue;

    // Check sticking time with enemy snake
    const pairKey = [snake.id, otherId].sort().join(':');
    const headDist = Math.hypot(snake.head.x - otherSnake.head.x, snake.head.y - otherSnake.head.y);

    if (headDist < 45) {
      const stuckTime = stickingMap.get(pairKey) || now;
      if (!stickingMap.has(pairKey)) stickingMap.set(pairKey, now);

      // If stuck for > 5000ms (5 seconds), bounce apart!
      if (now - stuckTime > 5000) {
        const bounceAngle = Math.atan2(snake.head.y - otherSnake.head.y, snake.head.x - otherSnake.head.x) || (Math.random() * Math.PI * 2);
        nextX += Math.cos(bounceAngle) * 80;
        nextY += Math.sin(bounceAngle) * 80;
        stickingMap.delete(pairKey);
      }
    } else {
      stickingMap.delete(pairKey);
    }

    // Check collision with enemy snake body
    const path = otherSnake.bodyPath;
    const endIndex = Math.max(0, path.length - 5); // Exclude tail tip nodes for attacks

    for (let i = 0; i < endIndex; i++) {
      const node = path[i];
      const d = Math.hypot(nextX - node.x, nextY - node.y);
      if (d < collisionRadius) {
        isBlocked = true;
        break;
      }
    }

    // Check collision with enemy snake's held foods
    if (!isBlocked && otherSnake.heldFoods) {
      for (let i = 0; i < otherSnake.heldFoods.length; i++) {
        const fx = otherSnake.head.x + otherSnake.direction.x * 26 - otherSnake.direction.x * (i * 24);
        const fy = otherSnake.head.y + otherSnake.direction.y * 26 - otherSnake.direction.y * (i * 24);
        const d = Math.hypot(nextX - fx, nextY - fy);
        if (d < collisionRadius) {
          isBlocked = true;
          break;
        }
      }
    }

    if (isBlocked) break;
  }

  if (isBlocked) {
    // Stop forward movement into solid obstacle body
    nextX = snake.head.x;
    nextY = snake.head.y;
  }

  const newHead = { x: nextX, y: nextY };
  const newDirection = dist > 5 ? { x: vx / speed, y: vy / speed } : snake.direction;

  // Update body path using continuous distance-constraint kinematics
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
