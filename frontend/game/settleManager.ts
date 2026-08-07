import { ArenaBounds, BodySegment, CandidateSentence, CandidateWord, CompletionRecord, FoodState, SnakeState, Theme } from '../types';
import { generateSingleFood, SENTENCE_GOLD_PALETTE } from './foodGenerator';

export function settleWord(
  snake: SnakeState,
  candidate: CandidateWord,
  foods: Record<string, FoodState>,
  bounds: ArenaBounds,
  activeTheme: Theme
): { updatedSnake: SnakeState; updatedFoods: Record<string, FoodState> } {
  const consumedFoods = snake.heldFoods;
  const firstColor = consumedFoods[0]?.color || snake.baseColor;
  const recordId = `rec-word-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const newSegment: BodySegment = {
    id: `seg-${recordId}`,
    type: 'word',
    lengthUnits: candidate.readingLength,
    colorMode: 'food',
    color: firstColor, // Strictly food color, NO GOLD!
    completionRecordId: recordId,
    flag: {
      type: 'word',
      text: candidate.canonical
    }
  };

  const record: CompletionRecord = {
    id: recordId,
    type: 'word',
    canonical: candidate.canonical,
    reading: candidate.reading,
    consumedFoodIds: consumedFoods.map(f => f.foodId),
    readingLength: candidate.readingLength,
    punctuationBonus: 0,
    totalLengthAdded: candidate.readingLength,
    theme: activeTheme,
    completedAt: Date.now()
  };

  const updatedSnake: SnakeState = {
    ...snake,
    earnedLength: snake.earnedLength + candidate.readingLength,
    totalLength: snake.totalLength + candidate.readingLength,
    bodySegments: [...snake.bodySegments, newSegment],
    heldFoods: [],
    buildState: {
      status: 'INVALID',
      candidates: [],
      sentenceCandidates: [],
      version: (snake.buildState.version || 0) + 1
    },
    completionHistory: [...snake.completionHistory, record]
  };

  // Replenish consumed map foods
  const nextFoods = { ...foods };
  consumedFoods.forEach((_, idx) => {
    const newId = `replenish-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
    nextFoods[newId] = generateSingleFood(newId, bounds);
  });

  return { updatedSnake, updatedFoods: nextFoods };
}

export function settleSentence(
  snake: SnakeState,
  candidate: CandidateSentence,
  foods: Record<string, FoodState>,
  bounds: ArenaBounds,
  activeTheme: Theme
): { updatedSnake: SnakeState; updatedFoods: Record<string, FoodState> } {
  const consumedFoods = snake.heldFoods;
  const recordId = `rec-sen-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const totalAddedLength = consumedFoods.length + candidate.totalLengthBonus;

  // GOLD BODY SEGMENT & TALL GOLD SAMURAI FLAG EXCLUSIVELY FOR SENTENCES!
  const newSegment: BodySegment = {
    id: `seg-${recordId}`,
    type: 'sentence',
    lengthUnits: totalAddedLength,
    colorMode: 'gold',
    color: SENTENCE_GOLD_PALETTE.primary,
    completionRecordId: recordId,
    flag: {
      type: 'sentence',
      text: candidate.text
    }
  };

  const record: CompletionRecord = {
    id: recordId,
    type: 'sentence',
    canonical: candidate.text,
    reading: candidate.text,
    consumedFoodIds: consumedFoods.map(f => f.foodId),
    readingLength: consumedFoods.length,
    punctuationBonus: candidate.totalLengthBonus,
    totalLengthAdded: totalAddedLength,
    theme: activeTheme,
    completedAt: Date.now()
  };

  const updatedSnake: SnakeState = {
    ...snake,
    earnedLength: snake.earnedLength + totalAddedLength,
    totalLength: snake.totalLength + totalAddedLength,
    bodySegments: [...snake.bodySegments, newSegment],
    heldFoods: [],
    buildState: {
      status: 'INVALID',
      candidates: [],
      sentenceCandidates: [],
      version: (snake.buildState.version || 0) + 1
    },
    completionHistory: [...snake.completionHistory, record]
  };

  // Replenish consumed map foods (punctuations do not consume map foods)
  const nextFoods = { ...foods };
  consumedFoods.forEach((_, idx) => {
    const newId = `replenish-sen-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
    nextFoods[newId] = generateSingleFood(newId, bounds);
  });

  return { updatedSnake, updatedFoods: nextFoods };
}
