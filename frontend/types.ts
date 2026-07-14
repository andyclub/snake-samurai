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
  resolved: boolean;
}

export type Language = 'zh-CN' | 'ja' | 'en' | 'zh-TW' | 'ko' | 'fr' | 'nl';
