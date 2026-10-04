import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import vm from 'node:vm';
import { acceptPlayerHostFrame, stopPlayerHostRoom } from '../frontend/playerHostRuntime.ts';

class FakeBrowserWorker {
  static instances = [];
  constructor(url, options) {
    this.url = String(url);
    this.options = options;
    this.messages = [];
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
    FakeBrowserWorker.instances.push(this);
  }
  postMessage(message) { this.messages.push(structuredClone(message)); }
  terminate() { this.terminated = true; }
  emit(data) { this.onmessage?.({ data: structuredClone(data) }); }
}

const previousWorker = globalThis.Worker;
globalThis.Worker = FakeBrowserWorker;

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const snapshot = (matchId = 'snake-match-1', phase = 'PLAYING') => ({
  phase,
  matchId,
  startedAt: 1_000,
  id: 'snake-free',
  mode: 'free',
  theme: 'free',
  bounds: { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 },
  snakes: {
    snakeOne: {
      id: 'snakeOne', playerId: 'actor', isBot: false, connected: true,
      heldFoods: [{ foodId: 'food-one', glyph: 'あ' }],
    },
  },
  foods: {},
  leaderboard: [],
  version: 1,
});
const grant = (overrides = {}) => ({
  type: 'host_grant', room: 'snake-free', fence: 8, seq: 10, serverNow: 60_000,
  playerId: 'designated', snapshot: snapshot(), questions: [],
  ...overrides,
});
const accept = (frame, sendIntent = async () => 'ok', roomId = 'snake-free', playerId = 'designated') =>
  acceptPlayerHostFrame({ roomId, playerId, frame, sendIntent });

test.afterEach(() => {
  stopPlayerHostRoom('snake-free');
});
test.after(() => {
  for (const room of ['snake-free', 'snake-theme', 'snake-disaster']) stopPlayerHostRoom(room);
  if (previousWorker === undefined) delete globalThis.Worker;
  else globalThis.Worker = previousWorker;
});

test('only valid snake player grants create a worker; same grant is stable and higher fence replaces it', () => {
  FakeBrowserWorker.instances = [];
  assert.equal(accept({ ...grant(), type: 'state' }), false);
  assert.equal(accept(grant({ room: 'main' })), false);
  assert.equal(accept(grant({ playerId: 'other' })), false);
  assert.equal(accept(grant({ snapshot: snapshot('snake-match-1', 'LOBBY') })), false);
  assert.equal(FakeBrowserWorker.instances.length, 0);

  assert.equal(accept(grant()), true);
  const worker = FakeBrowserWorker.instances[0];
  assert.match(worker.url, /playerHostWorker\.ts$/);
  assert.deepEqual(worker.options, { type: 'module' });
  assert.equal(worker.messages[0].snapshot.foods instanceof Object, true);
  assert.equal(accept(grant({ seq: 11, serverNow: 61_000 })), true);
  assert.equal(FakeBrowserWorker.instances.length, 1);

  assert.equal(accept(grant({ fence: 9, seq: 1 })), true);
  assert.equal(worker.terminated, true);
  assert.equal(FakeBrowserWorker.instances.length, 2);
  stopPlayerHostRoom('snake-free');
  assert.equal(FakeBrowserWorker.instances[1].terminated, true);
});

test('host actions use only current room/fence and trusted validation follows accepted snapshot', async () => {
  FakeBrowserWorker.instances = [];
  const calls = [];
  let resolveSnapshot;
  accept(grant(), intent => {
    calls.push(structuredClone(intent));
    if (intent.type === 'host_snapshot') return new Promise(resolve => { resolveSnapshot = resolve; });
    return Promise.resolve('ok');
  });
  const worker = FakeBrowserWorker.instances[0];
  const actionFrame = {
    type: 'host_action', room: 'snake-free', fence: 8, seq: 11, serverNow: 60_100,
    playerId: 'actor', action: { type: 'settle_word', candidateIndex: 0 },
  };
  assert.equal(accept({ ...actionFrame, fence: 7 }), false);
  assert.equal(accept(actionFrame), true);
  worker.emit({
    type: 'action_result',
    playerId: 'actor',
    result: { ok: false, code: 'requires_validation' },
    snapshot: snapshot(),
  });
  await flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'host_snapshot');
  assert.equal(calls[0].fencingToken, 8);
  assert.deepEqual(calls[0].snapshot, snapshot());
  resolveSnapshot('ok');
  await flush();

  assert.equal(calls.length, 2);
  assert.equal(calls[1].type, 'host_validate');
  assert.equal(calls[1].fencingToken, 8);
  assert.equal(calls[1].playerId, 'actor');
  assert.deepEqual(calls[1].heldFoodIds, ['food-one']);
});

test('snapshot sends stay serial and coalesce intermediate worker output', async () => {
  FakeBrowserWorker.instances = [];
  const sent = [];
  const resolvers = [];
  accept(grant(), intent => {
    sent.push(structuredClone(intent));
    return new Promise(resolve => resolvers.push(resolve));
  });
  const worker = FakeBrowserWorker.instances[0];
  worker.emit({ type: 'snapshot', changed: true, snapshot: { ...snapshot(), version: 2 } });
  await flush();
  worker.emit({ type: 'snapshot', changed: true, snapshot: { ...snapshot(), version: 3 } });
  worker.emit({ type: 'snapshot', changed: true, snapshot: { ...snapshot(), version: 4 } });
  await flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].snapshot.version, 2);

  resolvers[0]('ok');
  await flush();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].snapshot.version, 4);
  resolvers[1]('ok');
  await flush();
});

test('snake worker entrypoint parses as a browser TypeScript module', async () => {
  const source = await readFile(new URL('../frontend/playerHostWorker.ts', import.meta.url), 'utf8');
  await transform(source, { loader: 'ts', format: 'esm' });
});

test('input acknowledgements do not upload; changed events and scheduled ticks do', async () => {
  FakeBrowserWorker.instances = [];
  const sent = [];
  accept(grant(), intent => { sent.push(structuredClone(intent)); return Promise.resolve('ok'); });
  const worker = FakeBrowserWorker.instances[0];
  for (let index = 0; index < 20; index++) worker.emit({
    type: 'action_result', actionType: 'input', changed: true,
    result: true, snapshot: snapshot(), playerId: 'actor',
  });
  worker.emit({ type: 'snapshot', changed: false, snapshot: snapshot() });
  worker.emit({ type: 'action_result', actionType: 'vote', changed: false, result: { ok: true }, snapshot: snapshot() });
  await flush();
  assert.equal(sent.length, 0);
  worker.emit({ type: 'snapshot', changed: true, snapshot: snapshot() });
  await flush();
  assert.equal(sent.length, 1);
  worker.emit({ type: 'action_result', actionType: 'spill_tail', changed: true,
    result: { ok: true, changed: true }, snapshot: snapshot() });
  await flush();
  assert.equal(sent.length, 2);
  worker.emit({ type: 'snapshot', changed: false, endReason: 'timeout', snapshot: snapshot(undefined, 'THEATER') });
  await flush();
  assert.equal(sent.length, 3);
});

test('snapshot rejection emits bounded static diagnostics without payload or error text', async () => {
  FakeBrowserWorker.instances = [];
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    accept(grant(), async () => { throw new Error('test-only-secret-that-must-not-be-logged'); });
    const worker = FakeBrowserWorker.instances[0];
    for (let index = 0; index < 4; index++) {
      worker.emit({ type: 'snapshot', changed: true, snapshot: snapshot() });
      await flush();
    }
    assert.equal(warnings.length, 1);
    assert.deepEqual(warnings[0], ['Player host runtime operation failed', 'snapshot_not_accepted']);
    assert.equal(JSON.stringify(warnings).includes('secret'), false);
  } finally { console.warn = previousWarn; }
});

test('actual worker IPC keeps accumulated dirty changes until cadence, emits action metadata, ends once', async () => {
  const source = await readFile(new URL('../frontend/playerHostWorker.ts', import.meta.url), 'utf8');
  const code = (await transform(source, { loader: 'ts', format: 'cjs' })).code;
  const snakeGame = source.includes('createSnakeEngine');
  const cadence = snakeGame ? 150 : 500;
  let time = 0, callback, stopped = false;
  const emitted = [], results = [];
  const state = { ...snapshot(), foods: { 'test-food': {} } };
  const engine = {
    snapshot: () => structuredClone(state),
    tick: () => results.shift() || { snapshot: structuredClone(state), changed: false },
    input: () => true, vote: () => true,
    spillTail: () => ({ ok: true, changed: true }),
  };
  const scope = {
    self: {}, performance: { now: () => time }, structuredClone,
    postMessage: message => emitted.push(structuredClone(message)),
    setInterval: handler => { callback = handler; stopped = false; return 1; },
    clearInterval: id => { if (id) stopped = true; },
    require: () => ({ createSnakeEngine: () => engine, createRansenEngine: () => engine,
      generateInitialFoods: () => ({ 'test-food': {} }) }),
  };
  vm.runInNewContext(code, scope);
  const frame = grant();
  scope.self.onmessage({ data: {
    type: 'init', roomId: frame.room, playerId: frame.playerId,
    fence: frame.fence, serverNow: frame.serverNow, snapshot: state, questions: frame.questions,
  } });
  assert.equal(emitted[0].type, 'ready');
  const action = action => scope.self.onmessage({ data: {
    type: 'action', fence: frame.fence, playerId: 'actor', action,
  } });
  action({ type: 'input', x: 10, y: 20, targetX: 10, targetY: 20 });
  const acknowledgement = emitted.at(-1);
  assert.equal(acknowledgement.actionType, 'input');
  assert.equal(acknowledgement.changed, true);
  assert.equal(emitted.filter(frame => frame.type === 'snapshot').length, 0);
  time = cadence - 1; callback();
  assert.equal(emitted.filter(frame => frame.type === 'snapshot').length, 0);
  time = cadence; callback();
  assert.equal(emitted.filter(frame => frame.type === 'snapshot').length, 1);
  assert.equal(emitted.at(-1).changed, true);
  time += cadence; callback();
  assert.equal(emitted.filter(frame => frame.type === 'snapshot').length, 1);
  results.push({ snapshot: state, changed: true });
  time += 10; callback();
  time += cadence; callback();
  assert.equal(emitted.filter(frame => frame.type === 'snapshot').length, 2,
    'Earlier changed tick must survive a later unchanged tick');
  action({ type: snakeGame ? 'spill_tail' : 'vote' });
  assert.equal(emitted.at(-1).changed, true);
  assert.equal(emitted.at(-1).actionType, snakeGame ? 'spill_tail' : 'vote');
  results.push({ snapshot: { ...state, phase: 'THEATER' }, changed: false, endReason: 'timeout' });
  time += 1; callback();
  assert.equal(emitted.at(-1).endReason, 'timeout');
  assert.equal(stopped, true);
});
