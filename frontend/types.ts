export enum GamePhase {
  OFF = 'OFF',
  LOBBY = 'LOBBY',
  PLAYING = 'PLAYING',
  THEATER = 'THEATER'
}

export interface Player {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  iq?: number;
  isSpectator?: boolean;
  battleStats?: {
    battles: number;
    votes: number;
    correctVotes: number;
    wins: number;
    losses: number;
    devours: number;
    splits: number;
  };
}

export interface Slime {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  size: number; // Radius
  color: string;
  members: Player[];
  isDead: boolean;
  memberTargets?: Record<string, { x: number; y: number; at: number }>;
  spawnedAt?: number;
  invulnerableUntil?: number;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  type: 'grammar' | 'vocab' | 'culture';
  level?: string;
}

export interface Encounter {
  id: string;
  slime1Id: string;
  slime2Id: string;
  question: Question;
  startTime: number;
  votes1: Record<string, number>; // playerId -> optionIndex
  votes2: Record<string, number>;
  voteTimes1?: Record<string, number>; // host-observed submission timestamp
  voteTimes2?: Record<string, number>;
  participants1?: Player[];
  participants2?: Player[];
  resolved: boolean;
  result?: {
    winnerSlimeId: string;
    winnerName: string;
    correctIndex: number;
    loserSlimeId: string;
    loserName: string;
    outcome: 'split' | 'devour';
    leadMs?: number;
    resolvedAt?: number;
  };
}

export type ParticipantType = 'human' | 'bot';

export interface HistoryParticipant {
  id: string;
  name: string;
  participantType: ParticipantType;
}

export interface AuditEvent {
  id: string;
  type: 'match_started' | 'battle_started' | 'battle_resolved' | 'match_ended';
  at: number;
  details?: Record<string, string | number | boolean | string[]>;
}

export interface MatchHistory {
  matchNumber: number;
  status: 'completed' | 'interrupted';
  terminationReason: 'timeout' | 'last_slime' | 'manual_off' | 'manual_restart';
  startedAt: string;
  endedAt: string;
  lastSnapshotAt: string;
  durationSeconds: number;
  humanCount: number;
  botCount: number;
  participants: HistoryParticipant[];
  winners: HistoryParticipant[];
  losers: HistoryParticipant[];
  provisionalLeaders: HistoryParticipant[];
  survivingParticipants: HistoryParticipant[];
  events: AuditEvent[];
}

export type Language = 'zh-CN' | 'ja' | 'en' | 'zh-TW' | 'ko' | 'fr' | 'nl';
