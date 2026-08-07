import { CandidateSentence, HeldFood, Theme } from '../types';
import { calculateReadingLength } from './trieEngine';

interface SentenceRule {
  id: string;
  regex: RegExp;
  template: (match: RegExpExecArray) => string;
  punctuations: string[];
  themes: Theme[];
  disasterRelated?: boolean;
}

const SENTENCE_RULES: SentenceRule[] = [
  // 防灾句子 (Disaster Sentences)
  {
    id: 'sen_disaster_1',
    regex: /^(避難所|学校|高台|高い場所|非常口)(へ|に)(行く|逃げる|避難する|移動する)$/,
    template: (m) => `${m[1]}${m[2]}${m[3]}。`,
    punctuations: ['。'],
    themes: ['disaster', 'free'],
    disasterRelated: true
  },
  {
    id: 'sen_disaster_2',
    regex: /^(地震|津波|火災)(が|を)(起きる|防ぐ|守る|避難する)$/,
    template: (m) => `${m[1]}${m[2]}${m[3]}。`,
    punctuations: ['。'],
    themes: ['disaster', 'free'],
    disasterRelated: true
  },
  {
    id: 'sen_disaster_3',
    regex: /^(地震|津波)が起きたら(、)?(高台|高い場所|避難所)(へ|に)(逃げる|避難する)$/,
    template: (m) => `${m[1]}が起きたら、${m[3]}${m[4]}${m[5]}。`,
    punctuations: ['、', '。'],
    themes: ['disaster', 'free'],
    disasterRelated: true
  },
  {
    id: 'sen_disaster_4',
    regex: /^(避難所|非常口)(へ|に)(行ってください|逃げてください)$/,
    template: (m) => `${m[1]}${m[2]}${m[3]}。`,
    punctuations: ['。'],
    themes: ['disaster', 'free'],
    disasterRelated: true
  },

  // 自由/主题通用句子 (General / Theme Sentences)
  {
    id: 'sen_gen_1',
    regex: /^(学校|会社|駅|ホテル|海|山|日本|京都)(へ|に)(行く|来る|帰る)$/,
    template: (m) => `${m[1]}${m[2]}${m[3]}。`,
    punctuations: ['。'],
    themes: ['travel', 'study', 'work', 'life', 'free']
  },
  {
    id: 'sen_gen_2',
    regex: /^(本|日本語|宿題|辞書)(を)(読む|書く|勉強する)$/,
    template: (m) => `${m[1]}${m[2]}${m[3]}。`,
    punctuations: ['。'],
    themes: ['study', 'free']
  },
  {
    id: 'sen_gen_3',
    regex: /^(水|飴|寿司|抹茶|食料)(を)(食べる|飲む|買う)$/,
    template: (m) => `${m[1]}${m[2]}${m[3]}。`,
    punctuations: ['。'],
    themes: ['life', 'culture', 'free']
  },
  {
    id: 'sen_gen_4',
    regex: /^(ホテル|切符|名刺)(を)(予約する|作る|見る)$/,
    template: (m) => `${m[1]}${m[2]}${m[3]}。`,
    punctuations: ['。'],
    themes: ['travel', 'work', 'free']
  },
  {
    id: 'sen_gen_5',
    regex: /^(私|僕|学生|先生)は(日本語|本|写真)(を)(勉強する|見る|書く)$/,
    template: (m) => `${m[1]}は${m[2]}${m[3]}${m[4]}。`,
    punctuations: ['。'],
    themes: ['study', 'culture', 'life', 'free']
  },
  {
    id: 'sen_gen_6',
    regex: /^これ(は)(何|何ですか)(\?)?$/,
    template: () => `何ですか？`,
    punctuations: ['？'],
    themes: ['study', 'life', 'free']
  }
];

export function analyzeSentenceBuilding(heldFoods: HeldFood[], activeTheme: Theme): {
  isSentenceBuilding: boolean;
  isSentenceReady: boolean;
  candidates: CandidateSentence[];
} {
  if (!heldFoods || heldFoods.length < 3) {
    return { isSentenceBuilding: false, isSentenceReady: false, candidates: [] };
  }

  const surface = heldFoods.map(f => f.glyph).join('');

  // Check if particle (へ, に, を, が, は, で, と, も, の) is present in the middle of held Foods
  const containsParticle = /[へにおがはでとも力]/.test(surface.substring(1));

  let matchingCandidates: CandidateSentence[] = [];

  for (const rule of SENTENCE_RULES) {
    const match = rule.regex.exec(surface);
    if (match) {
      const formattedText = rule.template(match);
      const punctuations = rule.punctuations;
      const totalLengthBonus = punctuations.length; // +1 per punctuation mark
      const themeMatch = activeTheme === 'free' || rule.themes.includes(activeTheme) || (activeTheme === 'disaster' && Boolean(rule.disasterRelated));

      matchingCandidates.push({
        id: rule.id,
        text: formattedText,
        punctuations,
        totalLengthBonus,
        themeMatch
      });
    }
  }

  if (matchingCandidates.length > 0) {
    return {
      isSentenceBuilding: true,
      isSentenceReady: true,
      candidates: matchingCandidates
    };
  }

  if (containsParticle) {
    return {
      isSentenceBuilding: true,
      isSentenceReady: false,
      candidates: []
    };
  }

  return {
    isSentenceBuilding: false,
    isSentenceReady: false,
    candidates: []
  };
}
