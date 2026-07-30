const fs = require('fs');
const sourcePath = 'frontend/mockData.ts';
const source = fs.readFileSync(sourcePath, 'utf8');
const wanted = new Set(['CULTURE_BASE', 'LANGUAGE_BASE', 'DISASTER_BASE', 'TOYAMA_BASE']);
const groups = {};

const extractArrayLiteral = name => {
  const declaration = `const ${name} = `;
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`Unable to find ${name}`);
  const arrayStart = source.indexOf('[', start + declaration.length);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']' && --depth === 0) return source.slice(arrayStart, index + 1);
  }
  throw new Error(`Unable to parse ${name}`);
};

for (const name of wanted) {
  groups[name] = Function(`"use strict"; return (${extractArrayLiteral(name)});`)();
}

for (const name of wanted) {
  if (!Array.isArray(groups[name])) throw new Error(`Unable to extract ${name}`);
}

const definitions = [
  ['CULTURE_BASE', 'cult', 'culture', null],
  ['LANGUAGE_BASE', 'lang', 'language', null],
  ['DISASTER_BASE', 'bousai', 'disaster', '防災'],
  ['TOYAMA_BASE', 'toyama', 'toyama', '富山'],
];
const prompts = [
  text => text,
  text => `知識チェック：${text}`,
  text => `正しい答えを選んでください。${text}`,
  text => `次の問いに答えてください。${text}`,
  text => `学習内容を確認します。${text}`,
  text => `四つの選択肢から選びましょう。${text}`,
  text => `理解度クイズ：${text}`,
  text => `落ち着いて考えてください。${text}`,
  text => `もっとも適切な答えはどれですか。${text}`,
  text => `復習問題です。${text}`,
  text => `チャレンジ問題：${text}`,
  text => `今日の一問です。${text}`,
  text => `正解できるでしょうか。${text}`,
  text => `日本をもっと知ろう。${text}`,
  text => `クイズに挑戦してください。${text}`,
  text => `学んだことを思い出しましょう。${text}`,
  text => `ここで確認問題です。${text}`,
  text => `集中して答えましょう。${text}`,
  text => `次の四択問題です。${text}`,
  text => `知識バトル：${text}`,
];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const nullable = value => value == null ? 'null' : quote(value);
const rows = [];

for (const [groupName, prefix, category, defaultLevel] of definitions) {
  groups[groupName].forEach((question, index) => {
    const sourceKey = `q-${prefix}-${index + 1}`;
    const formats = category === 'culture' || category === 'language' ? prompts : prompts.slice(0, 1);
    formats.forEach((format, variantIndex) => {
      // Rotate choices deterministically. This removes the old bias where almost
      // every disaster/Toyama answer appeared in the first position.
      const shift = category === 'culture' || category === 'language'
        ? variantIndex % 4
        : index % 4;
      const options = question.options.map((_, optionIndex) => question.options[(optionIndex + shift) % 4]);
      const correctIndex = (question.correctIndex - shift + 4) % 4;
      const type = question.type || 'culture';
      const level = question.level || defaultLevel;
      rows.push(`(${quote(`${sourceKey}-v${variantIndex + 1}`)},${quote(sourceKey)},${variantIndex + 1},${quote(category)},${quote(type)},${nullable(level)},${quote(format(question.text))},${quote(JSON.stringify(options))}::jsonb,${correctIndex},true)`);
    });
  });
}

if (rows.length !== 750) throw new Error(`Expected 750 rows, generated ${rows.length}`);

const batches = [];
for (let index = 0; index < rows.length; index += 200) {
  batches.push(`insert into jec.ransen_questions (id,source_key,variant,category,question_type,level,text,options,correct_index,active) values\n${rows.slice(index, index + 200).join(',\n')}\non conflict (id) do update set source_key=excluded.source_key,variant=excluded.variant,category=excluded.category,question_type=excluded.question_type,level=excluded.level,text=excluded.text,options=excluded.options,correct_index=excluded.correct_index,active=excluded.active,updated_at=now();`);
}

const output = `${batches.join('\n')}\n`;
const outputPath = process.argv[2];
if (outputPath) {
  fs.writeFileSync(outputPath, output);
  console.log(`Wrote ${rows.length} questions to ${outputPath}`);
} else {
  process.stdout.write(output);
}
