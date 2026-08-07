import { supabase } from '../supabase';
import { LEXICON_DATA } from './lexiconData';
import { Theme } from '../types';

export interface FoodGlyphItem {
  g: string;
  type: 'hiragana' | 'dakuon' | 'handakuon' | 'small_kana' | 'katakana' | 'chouon' | 'kanji';
}

function getGlyphType(char: string): FoodGlyphItem['type'] {
  if (/[一-龠]/.test(char)) return 'kanji';
  if (/[ア-ン]/.test(char)) return 'katakana';
  if (/[がぎぐげござじずぜぞだぢづでどばびぶべぼ]/.test(char)) return 'dakuon';
  if (/[ぱぴぷぺぽ]/.test(char)) return 'handakuon';
  if (/[ゃゅょっぁぃぅぇぉ]/.test(char)) return 'small_kana';
  if (char === 'ー') return 'chouon';
  return 'hiragana';
}

const glyphPoolCache = new Map<Theme, FoodGlyphItem[]>();

export async function loadThemeGlyphPool(theme: Theme): Promise<FoodGlyphItem[]> {
  const cached = glyphPoolCache.get(theme);
  if (cached && cached.length > 0) return cached;

  const characters = new Set<string>();

  // 1. Load from local Lexicon & Sentences for theme
  for (const lexeme of LEXICON_DATA) {
    if (theme === 'free' || lexeme.themes.includes(theme) || (theme === 'disaster' && lexeme.disasterRelated)) {
      Array.from(lexeme.canonical).forEach(c => characters.add(c));
      Array.from(lexeme.reading).forEach(c => characters.add(c));
    }
  }

  // 2. Load from Supabase tables (ransen_* for free/random, bosai_* for disaster)
  try {
    const targetPrefix = theme === 'disaster' ? 'bosai' : 'ransen';

    // Query questions or word tables
    const { data: questions } = await supabase
      .from(`${targetPrefix}_questions`)
      .select('text, options')
      .limit(50);

    if (questions && questions.length > 0) {
      for (const q of questions) {
        if (q.text) Array.from(String(q.text)).forEach(c => {
          if (/[一-龠ぁ-ゔァ-ヴー]/.test(c)) characters.add(c);
        });
        if (Array.isArray(q.options)) {
          for (const opt of q.options) {
            Array.from(String(opt)).forEach(c => {
              if (/[一-龠ぁ-ゔァ-ヴー]/.test(c)) characters.add(c);
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Fallback to local glyph pool for theme: ${theme}`, err);
  }

  // Ensure common kana particles exist (へ, に, を, が, は, で, と, も, の)
  const particles = ['へ', 'に', 'を', 'が', 'は', 'で', 'と', 'も', 'の', 'あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と', 'っ', 'ー'];
  particles.forEach(p => characters.add(p));

  const items: FoodGlyphItem[] = Array.from(characters).map(c => ({
    g: c,
    type: getGlyphType(c)
  }));

  glyphPoolCache.set(theme, items);
  return items;
}

export function getSyncThemeGlyphPool(theme: Theme): FoodGlyphItem[] {
  const cached = glyphPoolCache.get(theme);
  if (cached && cached.length > 0) return cached;

  const characters = new Set<string>();
  for (const lexeme of LEXICON_DATA) {
    if (theme === 'free' || lexeme.themes.includes(theme) || (theme === 'disaster' && lexeme.disasterRelated)) {
      Array.from(lexeme.canonical).forEach(c => characters.add(c));
      Array.from(lexeme.reading).forEach(c => characters.add(c));
    }
  }
  const particles = ['へ', 'に', 'を', 'が', 'は', 'で', 'と', 'も', 'の', 'あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と', 'っ', 'ー'];
  particles.forEach(p => characters.add(p));

  return Array.from(characters).map(c => ({
    g: c,
    type: getGlyphType(c)
  }));
}
