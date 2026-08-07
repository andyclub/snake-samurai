import { ArenaBounds, FoodState, SnakeState, Theme } from '../types';

export function updateBotAI(
  bot: SnakeState,
  allSnakes: Record<string, SnakeState>,
  foods: Record<string, FoodState>,
  bounds: ArenaBounds
): { target: { x: number; y: number }; shouldSettleWordIndex?: number; shouldSettleSentenceIndex?: number } {
  // Find nearest food
  let nearestFood: FoodState | null = null;
  let minDist = Infinity;

  for (const fId of Object.keys(foods)) {
    const food = foods[fId];
    if (food.state !== 'ground') continue;
    const dist = Math.hypot(bot.head.x - food.x, bot.head.y - food.y);
    if (dist < minDist) {
      minDist = dist;
      nearestFood = food;
    }
  }

  let targetX = bot.target.x;
  let targetY = bot.target.y;

  if (nearestFood) {
    targetX = nearestFood.x;
    targetY = nearestFood.y;
  }

  // Check if bot should settle
  let shouldSettleWordIndex: number | undefined = undefined;
  let shouldSettleSentenceIndex: number | undefined = undefined;

  if (bot.buildState.status === 'SENTENCE_READY' && bot.buildState.sentenceCandidates.length > 0) {
    shouldSettleSentenceIndex = 0;
  } else if (bot.buildState.status === 'WORD_READY' && bot.buildState.candidates.length > 0) {
    // 70% chance to settle immediately
    if (Math.random() < 0.7) {
      shouldSettleWordIndex = 0;
    }
  }

  return {
    target: { x: targetX, y: targetY },
    shouldSettleWordIndex,
    shouldSettleSentenceIndex
  };
}
