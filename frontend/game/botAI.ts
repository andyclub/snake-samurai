import { ArenaBounds, FoodState, SnakeState, Theme } from '../types';
import { LEXICON_DATA } from '../language/lexiconData';

export function updateBotAI(
  bot: SnakeState,
  allSnakes: Record<string, SnakeState>,
  foods: Record<string, FoodState>,
  bounds: ArenaBounds,
  theme: Theme = 'free'
): { target: { x: number; y: number }; shouldSettleWordIndex?: number; shouldSettleSentenceIndex?: number } {
  const iq = bot.botLevel ? bot.botLevel * 25 : 50; // IQ 25, 50, 75, 100
  const heldString = bot.heldFoods.map(f => f.glyph).join('');

  let targetFood: FoodState | null = null;
  let minDist = Infinity;

  // 1. High-IQ Bots (75 & 100): Target specific characters needed for words/sentences!
  if (iq >= 75) {
    const candidateLexemes = LEXICON_DATA.filter(l =>
      theme === 'free' || l.themes.includes(theme) || (theme === 'disaster' && l.disasterRelated)
    );

    let targetChar: string | null = null;

    if (heldString.length > 0) {
      // Find a lexeme that starts with heldString
      const matchingLexeme = candidateLexemes.find(l =>
        l.canonical.startsWith(heldString) || l.reading.startsWith(heldString)
      );
      if (matchingLexeme) {
        const full = matchingLexeme.canonical.startsWith(heldString) ? matchingLexeme.canonical : matchingLexeme.reading;
        targetChar = full[heldString.length] || null;
      }
    }

    if (!targetChar) {
      // Pick the first character of a random target word
      const randomLex = candidateLexemes[Math.floor(Math.random() * candidateLexemes.length)];
      if (randomLex) {
        targetChar = randomLex.canonical[0] || randomLex.reading[0];
      }
    }

    if (targetChar) {
      for (const fId of Object.keys(foods)) {
        const food = foods[fId];
        if (food.state !== 'ground') continue;
        if (food.displayedGlyph === targetChar) {
          const dist = Math.hypot(bot.head.x - food.x, bot.head.y - food.y);
          if (dist < minDist) {
            minDist = dist;
            targetFood = food;
          }
        }
      }
    }
  }

  // 2. IQ 50 or fallback for 75/100: Find nearest ground food
  if (!targetFood) {
    for (const fId of Object.keys(foods)) {
      const food = foods[fId];
      if (food.state !== 'ground') continue;
      const dist = Math.hypot(bot.head.x - food.x, bot.head.y - food.y);
      if (dist < minDist) {
        minDist = dist;
        targetFood = food;
      }
    }
  }

  let targetX = bot.target.x;
  let targetY = bot.target.y;

  if (targetFood) {
    targetX = targetFood.x;
    targetY = targetFood.y;
  }

  // 3. Settle decision based on IQ probability
  let shouldSettleWordIndex: number | undefined = undefined;
  let shouldSettleSentenceIndex: number | undefined = undefined;

  const settleProb = iq >= 100 ? 1.0 : iq >= 75 ? 0.9 : iq >= 50 ? 0.7 : 0.3;

  if (bot.buildState.status === 'SENTENCE_READY' && bot.buildState.sentenceCandidates.length > 0) {
    if (Math.random() < settleProb) {
      shouldSettleSentenceIndex = 0;
    }
  } else if (bot.buildState.status === 'WORD_READY' && bot.buildState.candidates.length > 0) {
    if (Math.random() < settleProb) {
      shouldSettleWordIndex = 0;
    }
  }

  return {
    target: { x: targetX, y: targetY },
    shouldSettleWordIndex,
    shouldSettleSentenceIndex
  };
}
