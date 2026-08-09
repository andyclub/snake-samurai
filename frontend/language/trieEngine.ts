import { CandidateWord, HeldFood, Theme } from '../types';
import { LEXICON_DATA } from './lexiconData';
import { Lexeme } from './types';

export function calculateReadingLength(reading: string): number {
  return Array.from(reading).length;
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
    const normalizedReading = Array.from(reading).join('');
    if (surface === canonical || surface === reading || normalized === normalizedReading) {
      exactMatches.push(lexeme);
    }

    // Check prefix match
    if (canonical.startsWith(surface) || reading.startsWith(surface) || normalizedReading.startsWith(normalized)) {
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
