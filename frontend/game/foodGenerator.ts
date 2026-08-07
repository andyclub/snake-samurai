import { ArenaBounds, FoodState, Theme } from '../types';
import { getSyncThemeGlyphPool, FoodGlyphItem } from '../language/foodSourceManager';

export const FOOD_COLOR_PALETTE = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#a855f7'  // Violet
];

export const SENTENCE_GOLD_PALETTE = {
  primary: '#fbbf24',
  secondary: '#f59e0b',
  border: '#d97706',
  glow: 'rgba(251, 191, 36, 0.8)'
};

export function generateSingleFood(
  id: string,
  bounds: ArenaBounds,
  customPool?: FoodGlyphItem[],
  theme: Theme = 'free'
): FoodState {
  const pool = customPool && customPool.length > 0 ? customPool : getSyncThemeGlyphPool(theme);
  const item = pool[Math.floor(Math.random() * pool.length)];
  const color = FOOD_COLOR_PALETTE[Math.floor(Math.random() * FOOD_COLOR_PALETTE.length)];
  const margin = 40;
  const x = Math.floor(bounds.minX + margin + Math.random() * (bounds.maxX - bounds.minX - margin * 2));
  const y = Math.floor(bounds.minY + margin + Math.random() * (bounds.maxY - bounds.minY - margin * 2));

  return {
    id,
    displayedGlyph: item.g,
    normalizedGlyph: item.g,
    type: item.type as FoodState['type'],
    color,
    x,
    y,
    collisionRadius: 18,
    state: 'ground',
    heldByPlayerId: null
  };
}

export function generateInitialFoods(
  playerCount: number,
  bounds: ArenaBounds,
  customPool?: FoodGlyphItem[],
  theme: Theme = 'free'
): Record<string, FoodState> {
  const count = Math.max(20, playerCount * 16);
  const foods: Record<string, FoodState> = {};
  for (let i = 0; i < count; i++) {
    const id = `food-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`;
    foods[id] = generateSingleFood(id, bounds, customPool, theme);
  }
  return foods;
}
