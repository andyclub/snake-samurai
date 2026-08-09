import { CandidateWord, HeldFood, Theme } from '../types';
import { LEXICON_DATA } from './lexiconData';
import { Lexeme } from './types';

export function calculateReadingLength(reading: string): number {
  return Array.from(reading).length;
}

const toHiragana = (value: string) => Array.from(value.normalize('NFKC')).map(char => {
  const code = char.charCodeAt(0);
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : char;
}).join('');

const isKanji = (char: string) => /[\u3400-\u4dbf\u4e00-\u9fff々]/u.test(char);

/** Match any dictionary-grounded mixture of kanji spelling and kana reading. */
export function matchesLexemeSpelling(value: string, lexeme: Pick<Lexeme, 'canonical' | 'reading'>): boolean {
  const input = toHiragana(value);
  const canonical = Array.from(toHiragana(lexeme.canonical));
  const reading = Array.from(toHiragana(lexeme.reading));

  const visit = (canonicalIndex: number, readingIndex: number, inputIndex: number): boolean => {
    if (canonicalIndex === canonical.length) return readingIndex === reading.length && inputIndex === input.length;
    const current = canonical[canonicalIndex];
    if (!isKanji(current)) {
      return reading[readingIndex] === current && input[inputIndex] === current
        && visit(canonicalIndex + 1, readingIndex + 1, inputIndex + 1);
    }

    const remainingMinimum = canonical.slice(canonicalIndex + 1).length;
    const maxReadingLength = reading.length - readingIndex - remainingMinimum;
    for (let length = 1; length <= maxReadingLength; length++) {
      const readingForm = reading.slice(readingIndex, readingIndex + length).join('');
      if (input.startsWith(current, inputIndex)
        && visit(canonicalIndex + 1, readingIndex + length, inputIndex + current.length)) return true;
      if (input.startsWith(readingForm, inputIndex)
        && visit(canonicalIndex + 1, readingIndex + length, inputIndex + readingForm.length)) return true;
    }
    return false;
  };

  return visit(0, 0, 0);
}

export function searchCandidates(heldFoods: HeldFood[], activeTheme: Theme): {
  status: 'INVALID' | 'PREFIX' | 'WORD_READY';
  candidates: CandidateWord[];
} {
  if (!heldFoods || heldFoods.length === 0) {
    return { status: 'INVALID', candidates: [] };
  }

  const surface = heldFoods.map(f => f.glyph).join('');
  const normalized = heldFoods.map(f => f.normalizedGlyph).join('');

  let exactMatches: Lexeme[] = [];
  let prefixCount = 0;

  // Search exact match for full surface or normalized string
  for (const lexeme of LEXICON_DATA) {
    const canonical = lexeme.canonical;
    const reading = lexeme.reading;

    // Check an exact match for the complete held sequence.
    // i-adjectives are normally collected as hiragana readings (e.g. たかい),
    // so normalize both sides before testing the exact completion.
    const normalizedReading = toHiragana(reading);
    if (matchesLexemeSpelling(surface, lexeme) || matchesLexemeSpelling(normalized, lexeme)) {
      exactMatches.push(lexeme);
    }

    // Check prefix match
    if (toHiragana(canonical).startsWith(toHiragana(surface)) || normalizedReading.startsWith(toHiragana(surface)) || normalizedReading.startsWith(toHiragana(normalized))) {
      prefixCount++;
    }
  }

  if (exactMatches.length > 0) {
    // Remove duplicates
    const uniqueMatchesMap = new Map<string, Lexeme>();
    exactMatches.forEach(m => uniqueMatchesMap.set(m.id, m));
    const validMatches = Array.from(uniqueMatchesMap.values()).filter(lex => calculateReadingLength(lex.reading) >= 2 && Array.from(lex.canonical).length >= 2);

    if (validMatches.length > 0) {
      const candidates: CandidateWord[] = validMatches.map(lex => {
        const themeMatch = activeTheme === 'free' || lex.themes.includes(activeTheme) || (activeTheme === 'disaster' && Boolean(lex.disasterRelated));
        return {
          id: lex.id,
          canonical: lex.canonical,
          reading: lex.reading,
          meaning: lex.meaning,
          readingLength: calculateReadingLength(lex.reading),
          themeMatch
        };
      });

      return {
        status: 'WORD_READY',
        candidates
      };
    }
  }

  if (prefixCount > 0) {
    return { status: 'PREFIX', candidates: [] };
  }

  return { status: 'INVALID', candidates: [] };
}
