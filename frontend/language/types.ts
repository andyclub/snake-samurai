import { Theme } from '../types';

export interface Lexeme {
  id: string;
  canonical: string;         // e.g. "食べる", "避難所"
  reading: string;           // e.g. "たべる", "ひなんじょ"
  partsOfSpeech: string[];   // ['noun'], ['verb_v1'], ['particle'], etc.
  meaning?: string;
  themes: Theme[];
  disasterRelated?: boolean;
}

export interface SentencePattern {
  id: string;
  pattern: string;           // e.g. "NOUN + particle_he + VERB"
  themes: Theme[];
  disasterRelated?: boolean;
}
