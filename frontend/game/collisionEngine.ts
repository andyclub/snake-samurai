import { ArenaBounds, FoodState, SnakeState } from '../types';
import { generateSingleFood } from './foodGenerator';

export interface CollisionResult {
  updatedSnakes: Record<string, SnakeState>;
  updatedFoods: Record<string, FoodState>;
  events: {
    foodPickups: Array<{ snakeId: string; foodId: string; glyph: string }>;
    spills: Array<{ victimId: string; attackerId: string | null; foodCount: number }>;
  };
}

export function checkAndResolveCollisions(
  snakes: Record<string, SnakeState>,
  foods: Record<string, FoodState>,
  bounds: ArenaBounds
): CollisionResult {
  const nextSnakes = { ...snakes };
  const nextFoods = { ...foods };
  const foodPickups: Array<{ snakeId: string; foodId: string; glyph: string }> = [];
  const spills: Array<{ victimId: string; attackerId: string | null; foodCount: number }> = [];

  const snakeIds = Object.keys(nextSnakes);

  for (const sId of snakeIds) {
    const snake = nextSnakes[sId];
    if (!snake.connected) continue;

    // 1. Head vs Ground Food collision
    for (const fId of Object.keys(nextFoods)) {
      const food = nextFoods[fId];
      if (food.state !== 'ground') continue;

      const dist = Math.hypot(snake.head.x - food.x, snake.head.y - food.y);
      if (dist < 28) {
        // Pickup food
        const heldItem = {
          foodId: food.id,
          glyph: food.displayedGlyph,
          normalizedGlyph: food.normalizedGlyph,
          color: food.color,
          pickedAt: Date.now(),
          order: snake.heldFoods.length
        };

        nextSnakes[sId] = {
          ...nextSnakes[sId],
          heldFoods: [...nextSnakes[sId].heldFoods, heldItem]
        };

        delete nextFoods[fId];
        foodPickups.push({ snakeId: sId, foodId: fId, glyph: food.displayedGlyph });
        break; // Only pick one food per frame
      }
    }

    // 2. Head vs Enemy Tail collision (Spill Battle!)
    for (const victimId of snakeIds) {
      if (victimId === sId) continue; // Enemy only
      const victim = nextSnakes[victimId];
      if (!victim || victim.heldFoods.length === 0) continue;

      // Check last 4 nodes of victim's tail
      const path = victim.bodyPath;
      const tailNodes = path.slice(Math.max(0, path.length - 4));
      let isTailHit = false;

      for (const tNode of tailNodes) {
        const d = Math.hypot(snake.head.x - tNode.x, snake.head.y - tNode.y);
        if (d < 45) { // 45px generous tail hit radius
          isTailHit = true;
          break;
        }
      }

      if (isTailHit) {
        // Trigger tail spill battle for victim!
        const spilledItems = victim.heldFoods;
        spills.push({ victimId, attackerId: sId, foodCount: spilledItems.length });

        // Scatter spilled foods into current map bounds
        spilledItems.forEach((item, index) => {
          const newFoodId = `spill-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;
          const margin = 50;
          const rx = Math.floor(bounds.minX + margin + Math.random() * (bounds.maxX - bounds.minX - margin * 2));
          const ry = Math.floor(bounds.minY + margin + Math.random() * (bounds.maxY - bounds.minY - margin * 2));

          nextFoods[newFoodId] = {
            id: newFoodId,
            displayedGlyph: item.glyph,
            normalizedGlyph: item.normalizedGlyph,
            type: 'hiragana',
            color: item.color,
            x: rx,
            y: ry,
            collisionRadius: 18,
            state: 'ground',
            heldByPlayerId: null
          };
        });

        // Clear victim's held foods
        nextSnakes[victimId] = {
          ...nextSnakes[victimId],
          heldFoods: [],
          buildState: {
            status: 'INVALID',
            candidates: [],
            sentenceCandidates: [],
            version: (victim.buildState.version || 0) + 1
          }
        };
      }
    }
  }

  return {
    updatedSnakes: nextSnakes,
    updatedFoods: nextFoods,
    events: { foodPickups, spills }
  };
}

export function triggerSelfTailSpill(
  snakeId: string,
  snakes: Record<string, SnakeState>,
  foods: Record<string, FoodState>,
  bounds: ArenaBounds
): { updatedSnakes: Record<string, SnakeState>; updatedFoods: Record<string, FoodState> } {
  const snake = snakes[snakeId];
  if (!snake || snake.heldFoods.length === 0) return { updatedSnakes: snakes, updatedFoods: foods };

  const nextSnakes = { ...snakes };
  const nextFoods = { ...foods };
  const spilledItems = snake.heldFoods;

  spilledItems.forEach((item, index) => {
    const newFoodId = `self-spill-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;
    const margin = 50;
    const rx = Math.floor(bounds.minX + margin + Math.random() * (bounds.maxX - bounds.minX - margin * 2));
    const ry = Math.floor(bounds.minY + margin + Math.random() * (bounds.maxY - bounds.minY - margin * 2));

    nextFoods[newFoodId] = {
      id: newFoodId,
      displayedGlyph: item.glyph,
      normalizedGlyph: item.normalizedGlyph,
      type: 'hiragana',
      color: item.color,
      x: rx,
      y: ry,
      collisionRadius: 18,
      state: 'ground',
      heldByPlayerId: null
    };
  });

  nextSnakes[snakeId] = {
    ...snake,
    heldFoods: [],
    buildState: {
      status: 'INVALID',
      candidates: [],
      sentenceCandidates: [],
      version: (snake.buildState.version || 0) + 1
    }
  };

  return { updatedSnakes: nextSnakes, updatedFoods: nextFoods };
}
