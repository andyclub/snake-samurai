import { CandidateWord, HeldFood, Theme } from '../types';
import { LEXICON_DATA } from './lexiconData';
import { Lexeme } from './types';

export function calculateReadingLength(reading: string): number {
  // Unicode kana count
  // Kana units:普通假名=1, 小假名=1, 長音ー=1, 濁音=1
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

  for (const lexeme of LEXICON_DATA) {
    const canonical = lexeme.canonical;
    const reading = lexeme.reading;

    // Check exact match
    if (surface === canonical || surface === reading || normalized === reading) {
      exactMatches.push(lexeme);
    }

    // Check prefix match
    if (canonical.startsWith(surface) || reading.startsWith(surface) || reading.startsWith(normalized)) {
      prefixCount++;
    }
  }

  if (exactMatches.length > 0) {
    const candidates: CandidateWord[] = exactMatches.map(lex => {
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

  if (prefixCount > 0) {
    return { status: 'PREFIX', candidates: [] };
  }

  return { status: 'INVALID', candidates: [] };
}
