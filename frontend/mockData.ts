import { Question, Player } from './types';

export const MOCK_QUESTIONS: Question[] = [
  {
    id: 'q1',
    text: '「食べる」の謙譲語はどれですか？',
    options: ['召し上がる', 'いただく', 'おっしゃる', 'なさる'],
    correctIndex: 1,
    type: 'grammar',
    level: 'N3'
  },
  {
    id: 'q2',
    text: '日本の夏の風物詩で、空に打ち上げるものは？',
    options: ['花見', '花火', '月見', '雪祭り'],
    correctIndex: 1,
    type: 'culture'
  },
  {
    id: 'q3',
    text: '「一生懸命」の正しい読み方は？',
    options: ['いっしょうけんめい', 'いっしょけんめい', 'いっしょうけんみょう', 'いっしょけんみょう'],
    correctIndex: 0,
    type: 'vocab',
    level: 'N4'
  },
  {
    id: 'q4',
    text: '雨が降って＿＿＿、試合は行われます。',
    options: ['いても', 'いると', 'いれば', 'いたから'],
    correctIndex: 0,
    type: 'grammar',
    level: 'N3'
  },
  {
    id: 'q5',
    text: '日本の伝統的な衣装は？',
    options: ['スーツ', 'ドレス', '着物', 'パジャマ'],
    correctIndex: 2,
    type: 'culture'
  }
];

export const BOT_NAMES = ['太郎', '花子', 'Ken', 'Sakura', 'Yuki', 'Ryu'];
export const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export const generateBots = (count: number): Player[] => {
  return Array.from({ length: count }).map((_, i) => ({
    id: `bot-${Date.now()}-${i}`,
    name: BOT_NAMES[i % BOT_NAMES.length] + ' (Bot)',
    color: COLORS[i % COLORS.length],
    isBot: true
  }));
};

// Helper to blend two hex colors
export const blendColors = (color1: string, color2: string): string => {
  const hex2rgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };
  const rgb1 = hex2rgb(color1);
  const rgb2 = hex2rgb(color2);
  const blended = rgb1.map((c, i) => Math.round((c + rgb2[i]) / 2));
  return `#${blended.map(c => c.toString(16).padStart(2, '0')).join('')}`;
};
