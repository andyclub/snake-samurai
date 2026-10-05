import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const equal = (actual, expected) => assert.deepEqual(structuredClone(actual), structuredClone(expected));
const phases = { OFF: 'OFF', LOBBY: 'LOBBY', PLAYING: 'PLAYING', THEATER: 'THEATER' };
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
function harness() {
  const cells = [], effects = [], pending = [], timers = new Map();
  let cursor = 0, render, args, output, scheduled = false, mounted = true, timerId = 0;
  const unchanged = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const schedule = () => {
    if (scheduled || !mounted || !render) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (mounted) run(); });
  };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const id = cursor++;
      if (!(id in cells)) cells[id] = typeof initial === 'function' ? initial() : initial;
      return [cells[id], value => {
        const next = typeof value === 'function' ? value(cells[id]) : value;
        if (!Object.is(cells[id], next)) { cells[id] = next; schedule(); }
      }];
    },
    useRef(initial) { const id = cursor++; return cells[id] ?? (cells[id] = { current: initial }); },
    useCallback(callback, deps) {
      const id = cursor++;
      if (!cells[id] || !unchanged(cells[id].deps, deps)) cells[id] = { callback, deps };
      return cells[id].callback;
    },
    useMemo(factory, deps) {
      const id = cursor++;
      if (!cells[id] || !unchanged(cells[id].deps, deps)) cells[id] = { value: factory(), deps };
      return cells[id].value;
    },
    useEffect(callback, deps) {
      const id = cursor++;
      const previous = effects[id];
      if (!previous || !unchanged(previous.deps, deps)) {
        effects[id] = { deps, callback, cleanup: previous?.cleanup };
        pending.push(id);
      }
    },
  };
  react.default = react;
  react.__esModule = true;
  const window = {
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay, interval: false }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay, interval: true }); return id; },
    clearInterval: id => timers.delete(id),
    addEventListener() {}, removeEventListener() {},
    location: { search: '', href: 'https://game.example/' },
  };
  const document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
  const storage = new Map();
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  let now = 20_000;
  class TestDate extends Date { static now() { return now; } }
  const globals = { __REPO_COMMIT_COUNT__:0, __BUILD_DATE__:'2000-01-01', console, Date: TestDate, Math, URL, URLSearchParams, window, document, localStorage, performance: { now: () => now },
    requestAnimationFrame: () => { throw new Error('Browser host physics must remain disabled'); }, cancelAnimationFrame() {} };
  function load(path, dependencies) {
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), { loader: path.endsWith('.tsx') ? 'tsx' : 'ts', format: 'cjs', target: 'es2022' }).code;
    const module = { exports: {} };
    const require = name => {
      if (name === 'react') return react;
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected client dependency: ${name}`);
    };
    runInNewContext(`(function(require,module,exports){${code}\n})`, globals)(require, module, module.exports);
    return module.exports;
  }
  function run() {
    cursor = 0;
    output = render(args);
    for (const id of pending.splice(0)) {
      const effect = effects[id];
      effect.cleanup?.();
      effect.cleanup = effect.callback();
    }
    return output;
  }
  return {
    react, window, timers, load,
    mount(fn, props) { render = fn; args = props; return run(); },
    update(props) { args = props; return run(); },
    output: () => output,
    now: value => { now = value; },
    cleanup() { mounted = false; effects.forEach(effect => effect?.cleanup?.()); },
  };
}
function fakeHost() {
  const subscriptions = [], intents = [], retries = [];
  return {
    subscriptions, intents, retries,
    retryHostConnection: room => retries.push(room),
    subscribeHost(room, onFrame, onConnection) {
      const entry = { room, onFrame, onConnection, stopped: false };
      subscriptions.push(entry);
      return () => { entry.stopped = true; };
    },
    getHostIdentity: async () => ({ playerId: 'server-player' }),
    sendHostIntent: async (room, body) => { intents.push({ room, body }); return 'ok'; },
  };
}
const player = { id: 'untrusted-local-id', name: 'Guest', color: '#123456', isBot: false, isSpectator: true };
const snake = (heldCount = 2, completions = 0) => ({
  id: 'snake-server-player', playerId: 'server-player', nickname: 'Guest', baseColor: '#123456',
  connected: true, isBot: false, heldFoods: Array.from({ length: heldCount }, (_, order) => ({
    foodId: `f-${order}`, glyph: ['学', '校'][order] || 'へ', normalizedGlyph: ['学', '校'][order] || 'へ', order, color: '#123456', pickedAt: 1,
  })),
  completionHistory: Array.from({ length: completions }, (_, i) => ({ type: 'word', id: `r-${i}` })),
  head: { x: 0, y: 0 }, target: { x: 1, y: 0 }, direction: { x: 1, y: 0 }, bodyPath: [], bodySegments: [],
  earnedLength: completions * 4, totalLength: completions * 4, baseLength: 0, currentSpeed: 180,
  buildState: { status: 'WORD_READY', candidates: [{ id: 'school' }], sentenceCandidates: [], version: 1 },
});
const snapshot = (phase = 'PLAYING', participant = snake()) => ({
  id: 'snake-free', phase, mode: 'free', theme: 'free', startedAt: phase === 'PLAYING' ? 10_000 : null,
  endsAt: phase === 'PLAYING' ? 130_000 : null, lobbyEndsAt: null,
  snakes: participant ? { [participant.id]: participant } : {}, foods: {},
  bounds: { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 }, leaderboard: [], version: 1,
});
const frame = (state, players = [], serverNow = 19_000) => ({
  type: 'state', room: 'snake-free', fence: 1, seq: 1, serverNow, snapshot: state, players,
});
const find = (tree, predicate) => {
  if (!tree || typeof tree !== 'object') return undefined;
  if (predicate(tree)) return tree;
  for (const child of tree.props?.children?.flat(Infinity) || []) { const result = find(child, predicate); if (result) return result; }
};

test('hook uses server identity, edits/reconnect profile only, and never publishes or joins automatically', async () => {
  const h = harness(), host = fakeHost(), snapshots = [];
  const hook = h.load('../frontend/useSnakeSamuraiMultiplayer.ts', { './types': { GamePhase: phases }, './hostTransport': host });
  const options = { roomId: 'snake-free', player, onSnapshot: value => snapshots.push(value), onTailSpill() {} };
  try {
    h.mount(hook.useSnakeSamuraiMultiplayer, options);
    await flush();
    assert.equal(h.output().userId, undefined,'Identity is fetched after verified online, not once at mount');
    assert.equal(h.output().isHost, false);
    assert.equal(h.output().isJoined, false);
    host.subscriptions[0].onConnection('online');
    await flush();
    assert.equal(h.output().userId,'server-player');
    equal(host.intents.map(item => item.body), [{ type: 'profile', name: 'Guest', color: '#123456' }]);
    h.update({ ...options, player: { ...player, name: 'Edited', color: '#654321', isSpectator: false } });
    await flush();
    assert.equal(host.subscriptions.length, 1);
    equal(host.intents.at(-1).body, { type: 'profile', name: 'Edited', color: '#654321' });
    host.subscriptions[0].onConnection('connecting');
    await flush();
    host.subscriptions[0].onConnection('online');
    await flush();
    assert.ok(host.intents.every(item => item.body.type === 'profile' && Object.keys(item.body).length === 3));
    h.output().broadcastSnapshot(snapshot());
    h.output().broadcastTailSpill('attacker-selected-victim');
    assert.ok(host.intents.every(item => item.body.type === 'profile'));
    assert.equal(h.timers.size, 0);
  } finally { h.cleanup(); }
  assert.equal(host.subscriptions[0].stopped, true);
});

test('hook accepts all phases and empty snapshots with fixed first clock shift; trusted spill diff excludes settlements and disconnects', async () => {
  const h = harness(), host = fakeHost(), snapshots = [], spills = [];
  const hook = h.load('../frontend/useSnakeSamuraiMultiplayer.ts', { './types': { GamePhase: phases }, './hostTransport': host });
  try {
    h.mount(hook.useSnakeSamuraiMultiplayer, { roomId: 'snake-free', player, onSnapshot: value => snapshots.push(value), onTailSpill: id => spills.push(id) });
    await flush();
    const incoming = host.subscriptions[0].onFrame;
    incoming(frame({ ...snapshot('LOBBY', null), lobbyEndsAt: 30_000 }));
    assert.equal(snapshots.at(-1).lobbyEndsAt, 31_000);
    h.now(90_000);
    incoming(frame(snapshot(), [], 89_000));
    incoming(frame(snapshot('PLAYING', snake(0, 1)), [], 120_000));
    assert.equal(snapshots.at(-1).startedAt, 11_000);
    assert.equal(spills.length, 0);
    incoming(frame(snapshot('PLAYING', snake(2, 1))));
    incoming(frame(snapshot('PLAYING', { ...snake(0, 1), connected: false })));
    assert.equal(spills.length, 0);
    incoming(frame(snapshot('PLAYING', snake(2, 1))));
    incoming(frame(snapshot('PLAYING', snake(0, 1))));
    equal(spills, ['snake-server-player']);
    incoming(frame(snapshot('OFF', null)));
    assert.equal(snapshots.at(-1).phase, 'OFF');
    equal(snapshots.at(-1).snakes, {});
  } finally { h.cleanup(); }
});

test('join and exit are explicit scoped intents, and profile cannot enroll the user', async () => {
  const h = harness(), host = fakeHost();
  const hook = h.load('../frontend/useSnakeSamuraiMultiplayer.ts', { './types': { GamePhase: phases }, './hostTransport': host });
  try {
    h.mount(hook.useSnakeSamuraiMultiplayer, { roomId: 'snake-free', player, onSnapshot() {}, onTailSpill() {} });
    host.subscriptions[0].onConnection('online');
    await flush();
    equal(host.intents.map(item=>item.body),[{type:'profile',name:'Guest',color:'#123456'}]);
    host.intents.length=0;
    await h.output().joinMatch(false);
    await h.output().joinMatch(true);
    equal(host.intents.map(item => item.body), [
      { type: 'join', name: 'Guest', color: '#123456', isSpectator: false },
      { type: 'join', name: 'Guest', color: '#123456', isSpectator: true },
    ]);
    host.subscriptions[0].onFrame(frame(snapshot('LOBBY', null), [{ ...player, id: 'server-player', isSpectator: false }]));
    await flush();
    assert.equal(h.output().isJoined, true);
  } finally { h.cleanup(); }
});

function appFixture(configuration = {}) {
  const h = harness(), intents = [], profileChanges = [], audioCalls = [];
  let options;
  const components = Object.fromEntries(['GameBoard', 'LobbyScreen', 'TheaterScreen', 'GameOffScreen', 'ConnectionStatus', 'ScreenWakeLockSetting'].map(name => [name, function Component() {}]));
  const audio = Object.fromEntries(['init', 'setBGM', 'playTailSpill', 'playPickup', 'playWordCompleted', 'playSentenceCompleted', 'playVictory'].map(name => [name, (...args) => audioCalls.push([name, ...args])]));
  const hook = supplied => {
    options = supplied;
    return {
      userId: 'server-player', isHost: false, isJoined: false, connection: configuration.connection || 'online', connectionFailure:null, retryConnection(){}, registrationError: '', onlinePlayers: [],
      joinMatch: async isSpectator => { intents.push({ type: 'join', isSpectator }); return 'ok'; },
      sendIntent: async body => { intents.push(body); return 'ok'; },
      sendMoveIntent: async (targetX, targetY) => { intents.push({ type: 'input', targetX, targetY }); return configuration.moveResult ?? 'ok'; },
      requestSnapshot: async () => { intents.push({ type: 'request_state' }); return 'ok'; },
      broadcastSnapshot: () => { throw new Error('Client must not publish snapshots'); },
      broadcastTailSpill: () => { throw new Error('Client must not publicly spill'); },
    };
  };
  const noHost = () => { throw new Error('Authoritative helper must not run on browser action'); };
  const dependencies = {
    './useScreenWakeLock': { useScreenWakeLock: () => ({ enabled: true, status: 'unsupported', setEnabled() {}, retry() {} }) },
    './types': { GamePhase: phases },
    './i18n': { getBrowserLanguage: () => 'ja', translations: { ja: {} } },
    './audio': { audio }, './useSnakeSamuraiMultiplayer': { useSnakeSamuraiMultiplayer: hook },
    './supabase': { SNAKE_SAMURAI_ROOM_ID: 'snake-free' },
    './game/foodGenerator': { generateSingleFood: noHost },
    './game/snakeMovement': { updateSnakePosition: noHost },
    './game/collisionEngine': { checkAndResolveCollisions: noHost },
    './game/settleManager': { settleWord: noHost, settleSentence: noHost },
    './game/botAI': { updateBotAI: noHost },
    './language/trieEngine': { searchCandidates: () => ({ status: 'WORD_READY', candidates: [{ id: 'school' }, { id: 'other' }] }) },
    './language/sentenceEngine': { analyzeSentenceBuilding: () => ({ candidates: [{ id: 'sentence' }] }) },
  };
  for (const [name, component] of Object.entries(components)) dependencies[`./components/${name}`] = { __esModule: true, default: component };
  const app = h.load('../frontend/App.tsx', dependencies).default;
  h.mount(app);
  return { h, intents, components, audioCalls, configuration, options: () => options, tree: () => h.output() };
}

test('App sends candidate indices/compose/self-spill intents while only updating own target immediately', async () => {
  const f = appFixture();
  try {
    await flush();
    f.options().onSnapshot(snapshot(), 0);
    await flush();
    const board = find(f.tree(), node => node.type === f.components.GameBoard);
    assert.ok(board);
    const original = structuredClone(board.props.snakesRef.current['snake-server-player']);
    board.props.onPointerTarget(500, 100);
    equal(board.props.snakesRef.current['snake-server-player'].target, { x: 500, y: 100 });
    board.props.onSettleWord({ id: 'other', readingLength: 9999 });
    board.props.onSettleSentence({ id: 'sentence', totalLengthBonus: 9999 });
    board.props.onComposeHeldFoods();
    board.props.onSpillTail();
    equal(f.intents, [
      { type: 'input', targetX: 500, targetY: 100 },
      { type: 'settle_word', candidateIndex: 1 },
      { type: 'settle_sentence', candidateIndex: 0 },
      { type: 'compose' }, { type: 'spill_tail' },
    ]);
    assert.equal(board.props.snakesRef.current['snake-server-player'].earnedLength, original.earnedLength);
    equal(board.props.snakesRef.current['snake-server-player'].heldFoods, original.heldFoods);
    equal(board.props.snakesRef.current['snake-server-player'].completionHistory, original.completionHistory);
  } finally { f.h.cleanup(); }
});

test('App follows empty OFF/LOBBY frames, missing deadline never requests, each elapsed deadline requests at most once', async () => {
  const f = appFixture();
  try {
    await flush();
    assert.equal(f.h.timers.size, 0);
    f.options().onSnapshot(snapshot('PLAYING'), 0);
    await flush();
    const board = find(f.tree(), node => node.type === f.components.GameBoard);
    f.options().onSnapshot(snapshot('OFF', null), 0);
    await flush();
    assert.ok(find(f.tree(), node => node.type === f.components.GameOffScreen));
    equal(board.props.snakesRef.current, {});
    f.options().onSnapshot(snapshot('LOBBY', null), 0);
    await flush();
    assert.ok(find(f.tree(), node => node.type === f.components.LobbyScreen));
    assert.equal(f.h.timers.size, 0);
    equal(f.intents, []);
    f.options().onSnapshot({ ...snapshot('LOBBY', null), lobbyEndsAt: 21_000 }, 0);
    await flush();
    const deadlineTimers = [...f.h.timers.values()].filter(timer => !timer.interval);
    assert.equal(deadlineTimers.length, 1);
    deadlineTimers[0].callback();
    deadlineTimers[0].callback();
    equal(f.intents, [{ type: 'request_state' }]);
  } finally { f.h.cleanup(); }
  assert.equal(f.h.timers.size, 0);
});

test('snake-owned arena cards keep existing cross-game rooms but use watch subscriptions without GET timers', async () => {
  const h = harness(), host = fakeHost();
  const cards = h.load('../frontend/components/ArenaCards.tsx', { '../types': { GamePhase: phases }, '../hostTransport': host }).default;
  try {
    h.mount(cards, { t: key => key, arenaName: 'Snake', active: false });
    equal(host.subscriptions.map(entry => entry.room), ['main', 'bousai-toyama']);
    equal(Object.fromEntries(host.subscriptions.map(entry => [entry.room, 1])), { main: 1, 'bousai-toyama': 1 });
    assert.equal(h.timers.size, 0);
    assert.equal(host.intents.length, 0);
    host.subscriptions[0].onFrame(frame({ phase: 'PLAYING', arenaName: 'Ransen' }));
    await flush();
    assert.ok(find(h.output(), node => node.type === 'a' && node.props.href === 'https://game.example/'));
  } finally { h.cleanup(); }
  assert.ok(host.subscriptions.every(entry => entry.stopped));
});

test('Lobby profile edits remain separate from explicit join/exit and null deadline has no timer', async () => {
  const h = harness(), choices = [], edits = [];
  const component = () => null;
  const lobby = h.load('../frontend/components/LobbyScreen.tsx', {
    '../types': {}, 'lucide-react': { QrCode: component, Globe: component, X: component, HelpCircle: component },
    '../i18n': { saveLanguagePreference() {} },
    './SlimeAvatar': { __esModule: true, default: component },
    './FullscreenCountdown': { __esModule: true, default: component },
    './SnakeFaqModal': { __esModule: true, default: component },
  }).default;
  const props = { player, players: [], isJoined: false, onJoinChange: value => choices.push(value),
    selectedMode: 'free', selectedTheme: 'free', onUpdatePlayer: (...args) => edits.push(args),
    lang: 'ja', onSelectLanguage() {}, lobbyEndsAt: null, t: key => key };
  try {
    h.mount(lobby, props);
    assert.equal(h.timers.size, 0);
    const input = find(h.output(), node => node.type === 'input');
    input.props.onBlur();
    assert.equal(edits.length, 1);
    assert.equal(choices.length, 0);
    find(h.output(), node => node.type === 'button' && node.props.children.includes('lobby.joinRound')).props.onClick();
    equal(choices, [false]);
    h.update({ ...props, isJoined: true });
    find(h.output(), node => node.type === 'button' && node.props.children.includes('lobby.keepWatching')).props.onClick();
    equal(choices, [false, true]);
  } finally { h.cleanup(); }
});


test('failed initial session recovers canonical identity on verified online and sends profile only',async()=>{
  const h=harness(),host=fakeHost();
  let calls=0;
  host.getHostIdentity=async()=>{if(++calls===1)throw new Error('test-only private URL https://unit.invalid');return{playerId:'recovered-player',mode:'player'};};
  const hook=h.load('../frontend/useSnakeSamuraiMultiplayer.ts',{'./types':{GamePhase:phases},'./hostTransport':host});
  const failure={code:'SESSION_HTTP_ERROR',status:503,operation:'session',at:'2026-10-04T00:00:00.000Z'};
  try {
    h.mount(hook.useSnakeSamuraiMultiplayer,{roomId:'snake-free',player,onSnapshot(){},onTailSpill(){}});
    await flush();assert.equal(calls,0);assert.equal(h.output().connectionFailure,null);
    host.subscriptions[0].onConnection('error',failure);await flush();
    equal(h.output().connectionFailure,failure);
    h.output().retryConnection();equal(host.retries,['snake-free']);
    host.subscriptions[0].onConnection('online');await flush();
    assert.equal(h.output().connection,'error');
    assert.equal(h.output().connectionFailure.code,'HOST_IDENTITY_FAILED');
    assert.equal(h.output().connectionFailure.status,null);
    assert.equal(h.output().connectionFailure.operation,'session');
    assert.ok(!JSON.stringify(h.output().connectionFailure).includes('unit.invalid'));
    assert.equal(host.intents.length,0);
    h.output().retryConnection();host.subscriptions[0].onConnection('online');await flush();
    assert.equal(calls,2);assert.equal(h.output().userId,'recovered-player');
    assert.equal(h.output().connection,'online');assert.equal(h.output().connectionFailure,null);
    assert.equal(h.output().isHost,false);assert.equal(h.output().isJoined,false);
    equal(host.intents.map(item=>item.body),[{type:'profile',name:'Guest',color:'#123456'}]);
    h.cleanup();host.subscriptions[0].onConnection('error',failure);await flush();
    assert.equal(h.output().connectionFailure,null);
  }finally{h.cleanup();}
});

test('App does not predict or send movement while disconnected or its authoritative snake is disconnected', async () => {
  const f = appFixture({ connection: 'error' });
  try {
    await flush(); f.options().onSnapshot(snapshot(), 0); await flush();
    let board = find(f.tree(), node => node.type === f.components.GameBoard);
    board.props.onPointerTarget(500, 100);
    equal(board.props.snakesRef.current['snake-server-player'].target, {x:1,y:0});
    equal(f.intents, []);
    f.configuration.connection = 'online'; f.h.update(); await flush();
    f.options().onSnapshot(snapshot('PLAYING', {...snake(),connected:false}), 0); await flush();
    board = find(f.tree(), node => node.type === f.components.GameBoard);
    board.props.onPointerTarget(500,100);
    equal(board.props.snakesRef.current['snake-server-player'].target, {x:1,y:0});
    equal(f.intents, []);
  } finally { f.h.cleanup(); }
});

test('failed movement send restores its own prediction and exposes an error without reverting newer authority', async () => {
  const f=appFixture({moveResult:'error'});
  try {
    await flush();f.options().onSnapshot(snapshot(),0);await flush();
    let board=find(f.tree(),node=>node.type===f.components.GameBoard);
    board.props.onPointerTarget(500,100);await flush();
    equal(board.props.snakesRef.current['snake-server-player'].target,{x:1,y:0});
    assert.equal(find(f.tree(),node=>node.type===f.components.ConnectionStatus).props.failure.code,'INPUT_NOT_SENT');
    let resolve;f.configuration.moveResult=new Promise(done=>{resolve=done;});
    board=find(f.tree(),node=>node.type===f.components.GameBoard);
    board.props.onPointerTarget(600,100);
    f.options().onSnapshot(snapshot('PLAYING',{...snake(),target:{x:700,y:200}}),0);await flush();
    resolve('error');await flush();
    equal(board.props.snakesRef.current['snake-server-player'].target,{x:700,y:200});
  } finally {f.h.cleanup();}
});

test('a missed terminal frame triggers exactly one deadline recovery and settlement still requires server authority',async()=>{
 const f=appFixture();
 try {
  await flush();f.options().onSnapshot(snapshot(),0);await flush();
  const timers=[...f.h.timers.values()].filter(timer=>!timer.interval);
  assert.equal(timers.length,1);assert.equal(timers[0].delay,110250);
  timers[0].callback();timers[0].callback();await flush();
  equal(f.intents,[{type:'request_state'}]);
  assert.ok(find(f.tree(),node=>node.type===f.components.GameBoard));
  assert.equal(find(f.tree(),node=>node.type===f.components.TheaterScreen),undefined);
  f.options().onSnapshot(snapshot('THEATER'),0);await flush();
  assert.ok(find(f.tree(),node=>node.type===f.components.TheaterScreen));
  assert.equal(find(f.tree(),node=>node.type===f.components.GameBoard),undefined);
 }finally{f.h.cleanup();}
});
