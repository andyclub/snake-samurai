export enum GamePhase {
  OFF = 'OFF',
  LOBBY = 'LOBBY',
  PLAYING = 'PLAYING',
  THEATER = 'THEATER'
}

export type Theme = 'free' | 'life' | 'study' | 'work' | 'travel' | 'culture' | 'disaster';
export type ArenaMode = 'free' | 'random' | 'disaster';

export interface Player {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  iq?: number;
  isSpectator?: boolean;
  stats?: {
    matches: number;
    wordsCompleted: number;
    sentencesCompleted: number;
    tailHits: number;
    finalLength: number;
  };
}

export interface HeldFood {
  foodId: string;
  glyph: string;
  normalizedGlyph: string;
  color: string;
  pickedAt: number;
  order: number;
  x?: number;
  y?: number;
}

export interface CandidateWord {
  id: string;
  canonical: string;
  reading: string;
  meaning?: string;
  readingLength: number;
  themeMatch: boolean;
}

export interface CandidateSentence {
  id: string;
  text: string;
  punctuations: string[];
  totalLengthBonus: number;
  themeMatch: boolean;
}

export type LanguageBuildStatus = 'INVALID' | 'PREFIX' | 'WORD_READY' | 'SENTENCE_BUILDING' | 'SENTENCE_READY';

export interface LanguageBuildState {
  status: LanguageBuildStatus;
  candidates: CandidateWord[];
  sentenceCandidates: CandidateSentence[];
  version: number;
}

export interface BodySegment {
  id: string;
  type: 'base' | 'word' | 'sentence';
  lengthUnits: number;
  colorMode: 'player' | 'food' | 'gold';
  color: string;
  completionRecordId?: string;
  flag?: {
    type: 'word' | 'sentence';
    text: string;
  };
}

export interface CompletionRecord {
  id: string;
  type: 'word' | 'sentence';
  canonical: string;
  reading: string;
  consumedFoodIds: string[];
  readingLength: number;
  punctuationBonus: number;
  totalLengthAdded: number;
  theme: Theme;
  completedAt: number;
}

export interface BodyPoint {
  x: number;
  y: number;
}

export interface SnakeState {
  id: string;
  playerId: string;
  nickname: string;
  baseColor: string;
  head: BodyPoint;
  direction: BodyPoint;
  target: BodyPoint;
  bodyPath: BodyPoint[];
  bodySegments: BodySegment[];
  baseLength: number;
  earnedLength: number;
  totalLength: number;
  currentSpeed: number;
  heldFoods: HeldFood[];
  buildState: LanguageBuildState;
  completionHistory: CompletionRecord[];
  isBot: boolean;
  botLevel?: number;
  botOrigin?: 'automatic' | 'manual';
  connected: boolean;
  invulnerableUntil?: number;
  onBoundary?: boolean;
}

export interface FoodState {
  id: string;
  displayedGlyph: string;
  normalizedGlyph: string;
  type: 'hiragana' | 'dakuon' | 'handakuon' | 'small_kana' | 'katakana' | 'chouon' | 'kanji';
  color: string;
  x: number;
  y: number;
  collisionRadius: number;
  state: 'ground' | 'held';
  heldByPlayerId: string | null;
}

export interface ArenaBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ArenaState {
  id: string;
  mode: ArenaMode;
  theme: Theme;
  phase: GamePhase;
  startedAt: number | null;
  endsAt: number | null;
  bounds: ArenaBounds;
  snakes: Record<string, SnakeState>;
  foods: Record<string, FoodState>;
  leaderboard: LeaderboardEntry[];
  version: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  nickname: string;
  color: string;
  totalLength: number;
  wordsCount: number;
  sentencesCount: number;
  isBot: boolean;
}

export type ParticipantType = 'human' | 'bot';

export interface HistoryParticipant {
  id: string;
  name: string;
  participantType: ParticipantType;
  finalLength: number;
  wordsCompleted: number;
  sentencesCompleted: number;
}

export interface AuditEvent {
  id: string;
  type: 'match_started' | 'word_completed' | 'sentence_completed' | 'tail_spill' | 'match_ended';
  at: number;
  details?: Record<string, string | number | boolean | string[]>;
}

export interface MatchHistory {
  matchNumber: number;
  status: 'completed' | 'interrupted';
  terminationReason: 'timeout' | 'manual_off' | 'manual_restart';
  startedAt: string;
  endedAt: string;
  lastSnapshotAt: string;
  durationSeconds: number;
  humanCount: number;
  botCount: number;
  participants: HistoryParticipant[];
  winners: HistoryParticipant[];
  events: AuditEvent[];
}

export type Language = 'zh-CN' | 'ja' | 'en' | 'zh-TW' | 'ko' | 'fr' | 'nl';
