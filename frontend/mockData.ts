import { Question, Player } from './types';

// --- 基础文化题库模板 (Culture Templates) ---
const CULTURE_BASE = [
  { text: '日本の夏の風物詩で、空に打ち上げるものは？', options: ['花見', '花火', '月見', '雪祭り'], correctIndex: 1 },
  { text: '日本の伝統的な衣装は？', options: ['スーツ', 'ドレス', '着物', 'パジャマ'], correctIndex: 2 },
  { text: '日本の最も高い山は？', options: ['阿蘇山', '富士山', '桜島', '高尾山'], correctIndex: 1 },
  { text: '大晦日（12月31日）に食べる伝統的な麺料理は？', options: ['年越しそば', '年明けうどん', '月見ラーメン', '冷やし中華'], correctIndex: 0 },
  { text: '日本の国花として広く親しまれている花は？', options: ['梅', '菊', '桜', '椿'], correctIndex: 2 },
  { text: 'お正月に神社やお寺にお参りすることを何という？', options: ['初詣', 'お盆', '七五三', 'お彼岸'], correctIndex: 0 },
  { text: '節分（2月）に「鬼は外、福は内」と言いながら投げるものは？', options: ['塩', '米', '豆', 'お金'], correctIndex: 2 },
  { text: '日本の伝統的なスポーツで、力士が土俵で戦うものは？', options: ['柔道', '剣道', '空手', '相撲'], correctIndex: 3 },
  { text: '生魚を酢飯の上に乗せた日本の代表的な料理は？', options: ['天ぷら', 'すき焼き', '寿司', '刺身'], correctIndex: 2 },
  { text: '温泉に入る時、湯船に入れてはいけないものは？', options: ['タオル', '頭', '手', '足'], correctIndex: 0 },
  { text: '日本の伝統的なお茶の作法を何という？', options: ['華道', '書道', '茶道', '剣道'], correctIndex: 2 },
  { text: '日本の伝統的な演劇で、男性だけが演じるものは？', options: ['能', '狂言', '歌舞伎', '落語'], correctIndex: 2 },
  { text: '紙を折って動物や植物を作る日本の伝統遊びは？', options: ['あやとり', '折り紙', 'お手玉', 'けん玉'], correctIndex: 1 },
  { text: '大豆を発酵させて作る、ネバネバした日本の食品は？', options: ['豆腐', '味噌', '醤油', '納豆'], correctIndex: 3 },
  { text: '日本の高速鉄道の一般的な呼び名は？', options: ['地下鉄', 'モノレール', '新幹線', '路面電車'], correctIndex: 2 },
  { text: '日本の伝統的な部屋に敷かれている床材は？', options: ['カーペット', 'フローリング', '畳', 'タイル'], correctIndex: 2 },
  { text: '日本人が挨拶や感謝の時にする動作は？', options: ['ハグ', '握手', 'お辞儀', 'ハイタッチ'], correctIndex: 2 },
  { text: '日本で食事をする時に主に使う道具は？', options: ['フォーク', 'ナイフ', 'スプーン', '箸'], correctIndex: 3 },
  { text: 'アニメや電化製品の街として有名な東京の地名は？', options: ['渋谷', '新宿', '秋葉原', '池袋'], correctIndex: 2 },
  { text: '七夕（7月7日）に願い事を書いて笹に飾る紙を何という？', options: ['短冊', '絵馬', 'おみくじ', 'お守り'], correctIndex: 0 }
];

// --- 基础语言题库模板 (Language Templates) ---
const LANGUAGE_BASE = [
  { text: '「食べる」の謙譲語はどれですか？', options: ['召し上がる', 'いただく', 'おっしゃる', 'なさる'], correctIndex: 1, type: 'grammar', level: 'N3' },
  { text: '「行く」の尊敬語はどれですか？', options: ['まいる', 'うかがう', 'いらっしゃる', '申す'], correctIndex: 2, type: 'grammar', level: 'N3' },
  { text: '「一生懸命」の正しい読み方は？', options: ['いっしょうけんめい', 'いっしょけんめい', 'いっしょうけんみょう', 'いっしょけんみょう'], correctIndex: 0, type: 'vocab', level: 'N4' },
  { text: '雨が降って＿＿＿、試合は行われます。', options: ['いても', 'いると', 'いれば', 'いたから'], correctIndex: 0, type: 'grammar', level: 'N3' },
  { text: '「飛行機」の正しい読み方は？', options: ['ひこうき', 'ひこき', 'ひこうぎ', 'ひこぎ'], correctIndex: 0, type: 'vocab', level: 'N5' },
  { text: 'ここに自転車を＿＿＿いけません。', options: ['止めては', '止めても', '止めなくては', '止めなくても'], correctIndex: 0, type: 'grammar', level: 'N4' },
  { text: '富士山に登った＿＿＿がありますか。', options: ['こと', 'もの', 'とき', 'ところ'], correctIndex: 0, type: 'grammar', level: 'N4' },
  { text: '「郵便局」はどこですか？（読み方）', options: ['ゆうびんきょく', 'ゆうびんこく', 'ゆびんきょく', 'ゆびんこく'], correctIndex: 0, type: 'vocab', level: 'N4' },
  { text: '明日は早く起き＿＿＿なりません。', options: ['なければ', 'なくては', 'ないでは', 'ずには'], correctIndex: 0, type: 'grammar', level: 'N4' },
  { text: '「図書館」で本を借ります。（読み方）', options: ['としょかん', 'としょけん', 'としょうかん', 'としょうけん'], correctIndex: 0, type: 'vocab', level: 'N5' }
];

// --- 动态生成2000道题的题库 ---
export const MOCK_QUESTIONS: Question[] = (() => {
  const questions: Question[] = [];
  let idCounter = 1;

  // 1. 生成 1400 道日本文化题 (占比 70%)
  for (let i = 0; i < 1400; i++) {
    const template = CULTURE_BASE[i % CULTURE_BASE.length];
    questions.push({
      id: `q-cult-${idCounter++}`,
      text: template.text,
      options: [...template.options], // Clone array
      correctIndex: template.correctIndex,
      type: 'culture'
    });
  }

  // 2. 生成 600 道语言题 (占比 30%)
  for (let i = 0; i < 600; i++) {
    const template = LANGUAGE_BASE[i % LANGUAGE_BASE.length];
    questions.push({
      id: `q-lang-${idCounter++}`,
      text: template.text,
      options: [...template.options], // Clone array
      correctIndex: template.correctIndex,
      type: template.type as 'grammar' | 'vocab',
      level: template.level
    });
  }

  // 3. 洗牌算法 (Fisher-Yates Shuffle) 打乱题目顺序
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }

  return questions;
})();

export const BOT_NAMES = ['太郎', '花子', 'Ken', 'Sakura', 'Yuki', 'Ryu', 'Akira', 'Mei', 'Sora', 'Rin'];
export const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

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
