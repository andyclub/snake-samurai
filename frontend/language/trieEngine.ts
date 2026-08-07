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

    // Check exact match on full string or prefix/suffix sub-strings
    if (surface === canonical || surface === reading || normalized === reading) {
      exactMatches.push(lexeme);
    } else {
      // Also check if the beginning or end of heldFoods forms an exact word (e.g. 「日本」 inside 「日本あ」)
      if (surface.startsWith(canonical) || surface.startsWith(reading) || surface.endsWith(canonical) || surface.endsWith(reading)) {
        exactMatches.push(lexeme);
      }
    }

    // Check prefix match
    if (canonical.startsWith(surface) || reading.startsWith(surface) || reading.startsWith(normalized)) {
      prefixCount++;
    }
  }

  if (exactMatches.length > 0) {
    // Remove duplicates
    const uniqueMatchesMap = new Map<string, Lexeme>();
    exactMatches.forEach(m => uniqueMatchesMap.set(m.id, m));
    const validMatches = Array.from(uniqueMatchesMap.values()).filter(lex => calculateReadingLength(lex.reading) >= 2);

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
