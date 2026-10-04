import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnakeEngine } from '../frontend/game/snakeEngine.ts';

const START = 1_000;
const bounds = { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
const held = text => Array.from(text).map((glyph, order) => ({
  foodId: `held-${order}`, glyph, normalizedGlyph: glyph,
  color: '#123456', pickedAt: START, order,
}));
const snake = (playerId = 'p-one', text = '') => ({
  id: `snake-${playerId}`, playerId, nickname: playerId, baseColor: '#123456',
  head: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, target: { x: 0, y: 0 },
  bodyPath: Array.from({ length: 9 }, (_, i) => ({ x: -i * 14, y: 0 })),
  bodySegments: [], baseLength: 0, earnedLength: 0, totalLength: 0,
  currentSpeed: 180, heldFoods: held(text),
  buildState: { status: 'INVALID', candidates: [], sentenceCandidates: [], version: 1 },
  completionHistory: [], isBot: false, connected: true, onBoundary: false,
});
const arena = (players = [snake()]) => ({
  id: 'snake-free', mode: 'free', theme: 'free', phase: 'PLAYING',
  startedAt: START, endsAt: START + 120_000, bounds,
  snakes: Object.fromEntries(players.map(item => [item.id, item])),
  foods: Object.fromEntries(Array.from({ length: Math.max(1, players.length) * 12 }, (_, i) => [
    `food-${i}`, { id: `food-${i}`, displayedGlyph: 'あ', normalizedGlyph: 'あ',
      type: 'hiragana', color: '#123456', x: 500, y: 500,
      collisionRadius: 18, state: 'ground', heldByPlayerId: null },
  ])),
  leaderboard: [], version: 1,
});
const engine = snapshot => createSnakeEngine({ snapshot, now: () => START, random: () => 0.5 });

test('server roster permits registered identities and rejects late spectators and host/operator identities', () => {
  const first = snake();
  const late = snake('p-late');
  const game = engine(arena([first, late]));
  assert.equal(game.input('p-late', { targetX: 120, targetY: 80 }).ok, true);
  assert.equal(game.input('server-host', { targetX: 120, targetY: 80 }).ok, false);
  assert.equal(game.input('p-unknown', { targetX: 120, targetY: 80 }).ok, false);
  assert.equal(game.input('late-spectator', { targetX: 120, targetY: 80 }).ok, false);
  assert.deepEqual(game.snapshot().snakes[first.id].target, { x: 0, y: 0 });
});

test('rejects finite-coordinate bypasses and forged privileged input fields', () => {
  const game = engine(arena());
  for (const input of [
    { targetX: Infinity, targetY: 0 }, { targetX: NaN, targetY: 0 },
    { targetX: '5', targetY: 0 }, { targetX: 5, targetY: 0, victimId: 'p-other' },
    { targetX: 5, targetY: 0, earnedLength: 999 }, null,
  ]) assert.equal(game.input('p-one', input).ok, false);
  assert.equal(game.snapshot().snakes['snake-p-one'].earnedLength, 0);
});

test('settlement recomputes from held foods and ignores forged cached candidates', () => {
  const participant = snake('p-one', '学校');
  participant.buildState.candidates = [{ id: 'forged', canonical: 'fake', readingLength: 999999, themeMatch: true }];
  const game = engine(arena([participant]));
  assert.equal(game.settleWord('server-host', 0).ok, false);
  assert.equal(game.settleWord('p-one', { canonical: 'fake', readingLength: 999999 }).ok, false);
  assert.equal(game.settleWord('p-one', 99).ok, false);
  assert.equal(game.settleWord('p-one', 0).ok, true);
  const settled = game.snapshot().snakes[participant.id];
  assert.equal(settled.completionHistory[0].canonical, '学校');
  assert.equal(settled.totalLength, 4);
  assert.equal(settled.heldFoods.length, 0);
  assert.equal(game.settleWord('p-one', 0).ok, false);
});

test('sentence settlement uses server punctuation bonus and completion records', () => {
  const participant = snake('p-one', '学校へ行く');
  const game = engine(arena([participant]));
  assert.equal(game.settleSentence('p-one', 0).ok, true);
  const settled = game.snapshot().snakes[participant.id];
  assert.equal(settled.completionHistory[0].type, 'sentence');
  assert.equal(settled.completionHistory[0].canonical, '学校へ行く。');
  assert.equal(settled.totalLength, settled.completionHistory[0].totalLengthAdded);
  assert.equal(settled.bodySegments[0].colorMode, 'gold');
});

test('snapshot is isolated and disconnect does not replace roster or host authority', () => {
  const source = arena();
  const game = engine(source);
  source.snakes['snake-p-one'].totalLength = 900;
  const exposed = game.snapshot();
  exposed.snakes['snake-p-one'].earnedLength = 900;
  exposed.foods = {};
  assert.equal(game.snapshot().snakes['snake-p-one'].totalLength, 0);
  assert.equal(game.snapshot().snakes['snake-p-one'].earnedLength, 0);
  assert.equal(game.setConnected('p-one', false).ok, true);
  assert.equal(game.input('p-one', { targetX: 5, targetY: 0 }).ok, false);
  assert.deepEqual(Object.keys(game.snapshot().snakes), ['snake-p-one']);
  assert.equal(game.setConnected('p-one', true).ok, true);
  assert.equal(game.input('p-one', { targetX: 5, targetY: 0 }).ok, true);
});

test('idle ticks are clean and movement retains original speed and delta cap', () => {
  const game = engine(arena());
  assert.equal(game.tick(START, 0).dirty, false);
  const buildVersion = game.snapshot().snakes['snake-p-one'].buildState.version;
  game.input('p-one', { targetX: 500, targetY: 0 });
  game.tick(START, 100);
  assert.equal(game.snapshot().snakes['snake-p-one'].head.x, 18);
  assert.equal(game.snapshot().snakes['snake-p-one'].buildState.version, buildVersion);
  game.tick(START, 1000);
  assert.equal(game.snapshot().snakes['snake-p-one'].head.x, 36);
});

test('exact 120-second deadline settles once before physics and produces authoritative statistics', () => {
  const game = engine(arena([snake('p-one', '学校')]));
  game.settleWord('p-one', 0);
  const head = game.snapshot().snakes['snake-p-one'].head;
  const ended = game.tick(START + 120_000, 100);
  assert.equal(ended.endReason, 'timeout');
  assert.equal(ended.snapshot.phase, 'THEATER');
  assert.equal(ended.snapshot.endsAt, START + 120_000);
  assert.deepEqual(ended.snapshot.snakes['snake-p-one'].head, head);
  assert.equal(ended.snapshot.leaderboard[0].wordsCount, 1);
  assert.equal(ended.snapshot.leaderboard[0].totalLength, 4);
  assert.equal(game.tick(START + 120_001, 100).dirty, false);
  assert.equal(game.settleWord('p-one', 0).ok, false);
});

test('trusted validation continuation rejects stale held IDs and calculates its own reward', () => {
  const initial = arena([snake('p-one', '学校')]);
  initial.mode = 'disaster';
  initial.theme = 'disaster';
  const game = engine(initial);
  assert.equal(game.settleWord('p-one', 0).code, 'requires_validation');
  assert.equal(game.applyWordValidation('p-one', ['forged'], { ok: true, valid: true }).code, 'stale_validation');
  assert.equal(game.applyWordValidation('p-one', ['held-0', 'held-1'], { ok: true, valid: true, canonical: '学校', readingLength: 999 }).ok, true);
  assert.equal(game.snapshot().snakes['snake-p-one'].totalLength, 2);
  const rejected = engine(initial);
  const failure = rejected.applyWordValidation('p-one', ['held-0', 'held-1'], { ok: false, valid: false, reason: 'validation_unavailable' });
  assert.equal(failure.changed, true);
  assert.deepEqual(failure.events.spills, [{ victimId: 'snake-p-one', attackerId: null, foodCount: 2 }]);
  assert.equal(rejected.snapshot().snakes['snake-p-one'].heldFoods.length, 0);
  assert.equal(rejected.snapshot().snakes['snake-p-one'].totalLength, 0);
});

test('theme mismatch uses existing spill rules instead of crediting the word', () => {
  const initial = arena([snake('p-one', '学校')]);
  initial.mode = 'random';
  initial.theme = 'travel';
  const game = engine(initial);
  const mismatch = game.settleWord('p-one', 0);
  assert.equal(mismatch.code, 'theme_mismatch');
  assert.deepEqual(mismatch.events.spills, [{ victimId: 'snake-p-one', attackerId: null, foodCount: 2 }]);
  assert.equal(game.snapshot().snakes['snake-p-one'].totalLength, 0);
  assert.equal(game.snapshot().snakes['snake-p-one'].heldFoods.length, 0);
});

test('ground pickups invalidate build state once and shrink bounds at elapsed seconds', () => {
  const initial = arena();
  initial.foods['food-0'].x = 0;
  initial.foods['food-0'].y = 0;
  const game = engine(initial);
  const before = game.snapshot().snakes['snake-p-one'].buildState.version;
  const picked = game.tick(START, 0);
  assert.equal(picked.events.foodPickups.length, 1);
  assert.equal(picked.snapshot.snakes['snake-p-one'].heldFoods[0].foodId, 'food-0');
  assert.equal(picked.snapshot.snakes['snake-p-one'].buildState.version, before + 1);
  game.tick(START + 60_000, 0);
  assert.equal(game.snapshot().bounds.maxX, 950);
  assert.equal(Object.keys(game.snapshot().foods).length, 12);
});

test('tail collisions spill held foods without changing earned score', () => {
  const attacker = snake('attacker');
  const victim = snake('victim', '学校');
  victim.head = { x: 150, y: 0 };
  victim.target = { x: 150, y: 0 };
  victim.bodyPath = victim.bodyPath.map(point => ({ x: point.x + 150, y: point.y }));
  const game = engine(arena([attacker, victim]));
  const frame = game.tick(START, 0);
  assert.equal(frame.events.spills.length, 1);
  assert.equal(frame.events.spills[0].victimId, victim.id);
  assert.equal(frame.events.spills[0].attackerId, attacker.id);
  assert.equal(frame.snapshot.snakes[victim.id].heldFoods.length, 0);
  assert.equal(frame.snapshot.snakes[victim.id].earnedLength, 0);
  assert.equal(frame.snapshot.snakes[victim.id].buildState.status, 'INVALID');
});

test('helper-driven bot motion is repeatable with synchronous seeded global sources', () => {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const run = () => {
    let seed = 1234;
    Date.now = () => START;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const bot = snake('bot');
    bot.isBot = true;
    bot.botLevel = 4;
    const initial = arena([bot]);
    initial.foods = {};
    const game = createSnakeEngine({ snapshot: initial, now: () => START, random: () => Math.random() });
    game.tick(START, 16);
    return game.snapshot();
  };
  try {
    const first = run();
    const second = run();
    assert.deepEqual(second, first);
    assert.notDeepEqual(first.snakes['snake-bot'].head, { x: 0, y: 0 });
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
  }
});
