import { ArenaBounds, FoodState, Theme } from '../types';

export const FOOD_COLOR_PALETTE = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#a855f7'  // Violet
  // GOLD EXCLUDED!
];

export const SENTENCE_GOLD_PALETTE = {
  primary: '#fbbf24',
  secondary: '#f59e0b',
  border: '#d97706',
  glow: 'rgba(251, 191, 36, 0.8)'
};

const COMMON_GLYPHS = [
  // Hiragana
  { g: 'あ', type: 'hiragana' }, { g: 'い', type: 'hiragana' }, { g: 'う', type: 'hiragana' }, { g: 'え', type: 'hiragana' }, { g: 'お', type: 'hiragana' },
  { g: 'か', type: 'hiragana' }, { g: 'き', type: 'hiragana' }, { g: 'く', type: 'hiragana' }, { g: 'け', type: 'hiragana' }, { g: 'こ', type: 'hiragana' },
  { g: 'さ', type: 'hiragana' }, { g: 'し', type: 'hiragana' }, { g: 'す', type: 'hiragana' }, { g: 'せ', type: 'hiragana' }, { g: 'そ', type: 'hiragana' },
  { g: 'た', type: 'hiragana' }, { g: 'ち', type: 'hiragana' }, { g: 'つ', type: 'hiragana' }, { g: 'て', type: 'hiragana' }, { g: 'と', type: 'hiragana' },
  { g: 'な', type: 'hiragana' }, { g: 'に', type: 'hiragana' }, { g: 'ぬ', type: 'hiragana' }, { g: 'ね', type: 'hiragana' }, { g: 'の', type: 'hiragana' },
  { g: 'は', type: 'hiragana' }, { g: 'ひ', type: 'hiragana' }, { g: 'ふ', type: 'hiragana' }, { g: 'へ', type: 'hiragana' }, { g: 'ほ', type: 'hiragana' },
  { g: 'ま', type: 'hiragana' }, { g: 'み', type: 'hiragana' }, { g: 'む', type: 'hiragana' }, { g: 'め', type: 'hiragana' }, { g: 'も', type: 'hiragana' },
  { g: 'や', type: 'hiragana' }, { g: 'ゆ', type: 'hiragana' }, { g: 'よ', type: 'hiragana' },
  { g: 'ら', type: 'hiragana' }, { g: 'り', type: 'hiragana' }, { g: 'る', type: 'hiragana' }, { g: 'れ', type: 'hiragana' }, { g: 'ろ', type: 'hiragana' },
  { g: 'わ', type: 'hiragana' }, { g: 'を', type: 'hiragana' }, { g: 'ん', type: 'hiragana' },
  // Dakuon / Handakuon
  { g: 'が', type: 'dakuon' }, { g: 'ぎ', type: 'dakuon' }, { g: 'ぐ', type: 'dakuon' }, { g: 'げ', type: 'dakuon' }, { g: 'ご', type: 'dakuon' },
  { g: 'ざ', type: 'dakuon' }, { g: 'じ', type: 'dakuon' }, { g: 'ず', type: 'dakuon' }, { g: 'ぜ', type: 'dakuon' }, { g: 'ぞ', type: 'dakuon' },
  { g: 'だ', type: 'dakuon' }, { g: 'ぢ', type: 'dakuon' }, { g: 'づ', type: 'dakuon' }, { g: 'で', type: 'dakuon' }, { g: 'ど', type: 'dakuon' },
  { g: 'ぱ', type: 'handakuon' }, { g: 'ぴ', type: 'handakuon' }, { g: 'ぷ', type: 'handakuon' }, { g: 'ぺ', type: 'handakuon' }, { g: 'ぽ', type: 'handakuon' },
  // Small Kana & Long Vowel
  { g: 'ゃ', type: 'small_kana' }, { g: 'ゅ', type: 'small_kana' }, { g: 'ょ', type: 'small_kana' }, { g: 'っ', type: 'small_kana' },
  { g: 'ー', type: 'chouon' },
  // Katakana
  { g: 'コ', type: 'katakana' }, { g: 'ヒ', type: 'katakana' }, { g: 'ホ', type: 'katakana' }, { g: 'テ', type: 'katakana' }, { g: 'ル', type: 'katakana' },
  // Kanji
  { g: '地', type: 'kanji' }, { g: '震', type: 'kanji' }, { g: '津', type: 'kanji' }, { g: '波', type: 'kanji' }, { g: '避', type: 'kanji' }, { g: '難', type: 'kanji' },
  { g: '所', type: 'kanji' }, { g: '非', type: 'kanji' }, { g: '常', type: 'kanji' }, { g: '口', type: 'kanji' }, { g: '逃', type: 'kanji' }, { g: '食', type: 'kanji' },
  { g: '飲', type: 'kanji' }, { g: '行', type: 'kanji' }, { g: '来', type: 'kanji' }, { g: '見', type: 'kanji' }, { g: '学', type: 'kanji' }, { g: '校', type: 'kanji' },
  { g: '本', type: 'kanji' }, { g: '日', type: 'kanji' }, { g: '語', type: 'kanji' }, { g: '旅', type: 'kanji' }, { g: '高', type: 'kanji' }, { g: '場', type: 'kanji' }
] as const;

export function generateSingleFood(id: string, bounds: ArenaBounds): FoodState {
  const item = COMMON_GLYPHS[Math.floor(Math.random() * COMMON_GLYPHS.length)];
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

export function generateInitialFoods(playerCount: number, bounds: ArenaBounds): Record<string, FoodState> {
  const count = Math.max(8, playerCount * 8);
  const foods: Record<string, FoodState> = {};
  for (let i = 0; i < count; i++) {
    const id = `food-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`;
    foods[id] = generateSingleFood(id, bounds);
  }
  return foods;
}
