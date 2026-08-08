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
  const boostChars: string[] = []; // Characters from short words get extra copies

  // 1. Load from local Lexicon & Sentences for theme
  for (const lexeme of LEXICON_DATA) {
    if (theme === 'free' || lexeme.themes.includes(theme) || (theme === 'disaster' && lexeme.disasterRelated)) {
      const canonicalChars = Array.from(lexeme.canonical);
      const readingChars = Array.from(lexeme.reading);
      canonicalChars.forEach(c => characters.add(c));
      readingChars.forEach(c => characters.add(c));

      // Boost chars from short words (2-3 chars) to make word formation easier
      if (canonicalChars.length >= 2 && canonicalChars.length <= 3) {
        canonicalChars.forEach(c => { boostChars.push(c); boostChars.push(c); }); // 2x extra
        readingChars.forEach(c => boostChars.push(c)); // 1x extra
      }
    }
  }

  // 2. Load from the shared Chofu-Ransen question bank. The bousai corpus is
  // stored in jec.ransen_questions with the Japanese level label "防災".
  try {
    let questionQuery = supabase
      .from('ransen_questions')
      .select('text, options')
      .eq('active', true)
      .limit(50);
    if (theme === 'disaster') questionQuery = questionQuery.eq('level', '防災');

    const { data: questions, error } = await questionQuery;
    if (error) throw error;

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

  // Add boosted copies for short-word characters (increases their spawn probability)
  for (const c of boostChars) {
    items.push({ g: c, type: getGlyphType(c) });
  }

  glyphPoolCache.set(theme, items);
  return items;
}

export function getSyncThemeGlyphPool(theme: Theme): FoodGlyphItem[] {
  const cached = glyphPoolCache.get(theme);
  if (cached && cached.length > 0) return cached;

  const characters = new Set<string>();
  const boostChars: string[] = []; // Characters from short words get extra copies

  for (const lexeme of LEXICON_DATA) {
    if (theme === 'free' || lexeme.themes.includes(theme) || (theme === 'disaster' && lexeme.disasterRelated)) {
      const canonicalChars = Array.from(lexeme.canonical);
      const readingChars = Array.from(lexeme.reading);
      canonicalChars.forEach(c => characters.add(c));
      readingChars.forEach(c => characters.add(c));

      // Boost chars from short words (2-3 chars) to make word formation easier
      if (canonicalChars.length >= 2 && canonicalChars.length <= 3) {
        canonicalChars.forEach(c => { boostChars.push(c); boostChars.push(c); }); // 2x extra
        readingChars.forEach(c => boostChars.push(c)); // 1x extra
      }
    }
  }

  const particles = ['へ', 'に', 'を', 'が', 'は', 'で', 'と', 'も', 'の', 'あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と', 'っ', 'ー'];
  particles.forEach(p => characters.add(p));

  // Build base items from unique set
  const items: FoodGlyphItem[] = Array.from(characters).map(c => ({
    g: c,
    type: getGlyphType(c)
  }));

  // Add boosted copies for short-word characters (increases their spawn probability)
  for (const c of boostChars) {
    items.push({ g: c, type: getGlyphType(c) });
  }

  glyphPoolCache.set(theme, items);
  return items;
}
