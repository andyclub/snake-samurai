import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { registerHooks } from 'node:module';

const serverKeys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const serverPublicKey = await webcrypto.subtle.exportKey('jwk', serverKeys.publicKey);
const encode = value => new TextEncoder().encode(JSON.stringify(value));
const signature = async value => Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, serverKeys.privateKey, encode(value))).toString('base64url');
const signed = async value => ({ ...value, signature: await signature(value) });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async condition => {
  for (let count = 0; count < 2_000; count++) {
    if (condition()) return;
    await pause(2);
  }
  assert.fail('Mock transport condition timed out');
};
let moduleNumber = 0;
// Replace only the network adapter in tests; transport and crypto run unchanged.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './supabase' && context.parentURL?.includes('/frontend/hostTransport.ts')) return { url: new URL('./supabase.ts', context.parentURL).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('/frontend/supabase.ts')) return {
      format: 'module', shortCircuit: true,
      source: 'export const supabase = globalThis.__hostFakeSupabase;',
    };
    return nextLoad(url, context);
  },
});

async function fixture(mode = 'shanghai') {
  const saved = new Map();
  const override = (name, value) => {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const storage = new Map();
  const listeners = { window: new Map(), document: new Map() };
  const requests = [];
  const sockets = [];
  const channels = [];
  const state = { mode, fence: 1, visibility: 'visible', sessionCount: 0, failSession: false };
  class Socket {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    constructor(url) { this.url = url; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    disconnect() { this.onclose?.({}); }
  }
  override('crypto', webcrypto);
  override('localStorage', { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) });
  override('location', { origin: 'https://game.example', protocol: 'https:' });
  override('window', { addEventListener: (name, callback) => listeners.window.set(name, callback) });
  override('document', {
    get visibilityState() { return state.visibility; },
    addEventListener: (name, callback) => listeners.document.set(name, callback),
  });
  override('WebSocket', Socket);
  override('fetch', async (url, options) => {
    requests.push({ url, ...options, parsed: JSON.parse(options.body) });
    state.sessionCount += 1;
    if (state.failSession) throw new Error('Offline');
    return {
      ok: true,
      json: async () => ({ ok: true, ticket: `ticket-${state.sessionCount}`, playerId: 'server-player',
        statePublicKey: serverPublicKey, fencingToken: state.fence, mode: state.mode,
        ...(state.mode !== 'shanghai' ? { nonce: `fallback-${state.sessionCount}` } : {}) }),
    };
  });
  override('__hostFakeSupabase', {
    channel(name, options) {
      const channel = {
        name, options, sent: [], registrations: [], closed: false,
        on(type, filter, callback) { this.registrations.push({ type, filter }); this.callback = callback; return this; },
        subscribe(callback) { queueMicrotask(() => callback('SUBSCRIBED')); return this; },
        async send(message) { this.sent.push(message); return 'ok'; },
        async unsubscribe() { this.closed = true; },
        emit(payload) { this.callback?.({ payload }); },
      };
      channels.push(channel);
      return channel;
    },
  });
  const transport = await import(`../frontend/hostTransport.ts?test=${++moduleNumber}`);
  const stops = [];
  const watch = room => {
    const frames = [], connections = [];
    stops.push(transport.subscribeHost(room, frame => frames.push(frame), connection => connections.push(connection)));
    return { frames, connections };
  };
  const activate = async (room = 'snake-free', nonce = 'nonce-1') => {
    await waitFor(() => sockets.some(socket => new URL(socket.url).searchParams.get('room') === room && socket.readyState === 1));
    const socket = sockets.findLast(item => new URL(item.url).searchParams.get('room') === room && item.readyState === 1);
    socket.emit({ type: 'challenge', nonce, fence: state.fence });
    await waitFor(() => socket.sent.length >= 2);
    return socket;
  };
  const frame = (seq = 1, extra = {}) => ({
    type: 'state', room: 'snake-free', fence: state.fence, seq, serverNow: 10_000,
    snapshot: { phase: 'PLAYING', snakes: { one: { head: { x: 0, y: 0 } } } },
    players: [{ id: 'server-player' }], ...extra,
  });
  return { transport, state, sockets, channels, requests, storage, watch, activate, frame, listeners,
    cleanup() {
      stops.splice(0).forEach(stop => stop());
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

test('same room shares one connection and sends only public guest key; idle has no periodic writes', async () => {
  const f = await fixture();
  try {
    f.watch('snake-free'); f.watch('snake-free');
    const socket = await f.activate();
    assert.equal(f.sockets.length, 1);
    assert.equal(f.requests.length, 1);
    assert.deepEqual(Object.keys(f.requests[0].parsed), ['publicKey']);
    assert.equal('d' in f.requests[0].parsed.publicKey, false);
    const identity = await f.transport.getHostIdentity();
    assert.equal(identity.playerId, 'server-player');
    assert.equal('privateKey' in identity, false);
    assert.deepEqual(socket.sent.map(message => message.body.type), ['watch', 'request_state']);
    const count = socket.sent.length;
    await pause(110);
    assert.equal(socket.sent.length, count);
    assert.equal(f.requests.length, 1);
  } finally { f.cleanup(); }
});

test('outgoing intent signature covers ticket, fresh nonce, sequence, room and unchanged body', async () => {
  const f = await fixture();
  try {
    f.watch('snake-free');
    const socket = await f.activate();
    const body = { type: 'profile', name: 'guest', color: '#123456' };
    assert.equal(await f.transport.sendHostIntent('snake-free', body), 'ok');
    const message = socket.sent.at(-1);
    const { signature: proof, ...unsigned } = message;
    const publicKey = await webcrypto.subtle.importKey('jwk', f.requests[0].parsed.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    assert.equal(Buffer.from(proof, 'base64url').length, 64);
    assert.equal(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(proof, 'base64url'), encode(unsigned)), true);
    assert.deepEqual(unsigned.body, body);
    assert.equal(unsigned.ticket, 'ticket-1');
    assert.equal(unsigned.nonce, 'nonce-1');
    assert.equal(unsigned.room, 'snake-free');
    assert.equal(unsigned.sequence, 3);
  } finally { f.cleanup(); }
});

test('server signatures, room, fences and monotonically increasing sequence gate states', async () => {
  const f = await fixture();
  try {
    const viewer = f.watch('snake-free');
    const socket = await f.activate();
    socket.emit(await signed(f.frame(5)));
    await waitFor(() => viewer.frames.length === 1);
    socket.emit(await signed(f.frame(4)));
    socket.emit(await signed(f.frame(6, { room: 'other-room' })));
    socket.emit(await signed(f.frame(6, { fence: 0 })));
    const tampered = await signed(f.frame(6));
    tampered.snapshot.phase = 'THEATER';
    socket.emit(tampered);
    await pause(25);
    assert.equal(viewer.frames.length, 1);
    socket.emit(await signed(f.frame(0, { fence: 2 })));
    await waitFor(() => viewer.frames.length === 2);
    assert.equal(viewer.frames.at(-1).fence, 2);
    assert.equal(viewer.frames.at(-1).snapshot.phase, 'PLAYING');
  } finally { f.cleanup(); }
});

test('patch applies atomically to snapshot, preserves players, and gap requests one full state', async () => {
  const f = await fixture();
  try {
    const viewer = f.watch('snake-free');
    const socket = await f.activate();
    socket.emit(await signed(f.frame(1)));
    await waitFor(() => viewer.frames.length === 1);
    socket.emit(await signed({ type: 'patch', room: 'snake-free', fence: 1, seq: 2, baseSeq: 1, serverNow: 11_000,
      patch: [{ op: 'set', path: ['snakes', 'one', 'head', 'x'], value: 18 }] }));
    await waitFor(() => viewer.frames.length === 2);
    assert.equal(viewer.frames[1].snapshot.snakes.one.head.x, 18);
    assert.deepEqual(viewer.frames[1].players, viewer.frames[0].players);
    assert.equal(viewer.frames[1].serverNow, 11_000);
    const gap = { type: 'patch', room: 'snake-free', fence: 1, seq: 4, baseSeq: 3, serverNow: 12_000, patch: [] };
    socket.emit(await signed(gap));
    socket.emit(await signed({ ...gap, seq: 5 }));
    await waitFor(() => socket.sent.filter(message => message.body.type === 'request_state').length === 2);
    await pause(20);
    assert.equal(viewer.frames.length, 2);
    assert.equal(socket.sent.filter(message => message.body.type === 'request_state').length, 2);
    socket.emit(await signed(f.frame(6)));
    await waitFor(() => viewer.frames.length === 3);
  } finally { f.cleanup(); }
});

test('prototype patch and malformed signed frame are rejected without mutating accepted snapshots', async () => {
  const f = await fixture();
  try {
    const viewer = f.watch('snake-free');
    const socket = await f.activate();
    socket.emit(await signed(f.frame(1)));
    await waitFor(() => viewer.frames.length === 1);
    socket.emit(await signed({ type: 'patch', room: 'snake-free', fence: 1, seq: 2, baseSeq: 1, serverNow: 11_000,
      patch: [{ op: 'set', path: ['__proto__', 'polluted'], value: true }] }));
    await waitFor(() => viewer.connections.includes('error'));
    assert.equal({}.polluted, undefined);
    assert.equal(viewer.frames.length, 1);
    socket.emit(await signed(f.frame(3, { players: {} })));
    await pause(15);
    assert.equal(viewer.frames.length, 1);
    assert.equal(viewer.frames[0].snapshot.snakes.one.head.x, 0);
  } finally { f.cleanup(); }
});

test('visible reconnect refreshes session/nonce and ignores old socket frames while preserving outgoing sequence', async () => {
  const f = await fixture();
  try {
    const viewer = f.watch('snake-free');
    const oldSocket = await f.activate();
    oldSocket.emit(await signed(f.frame(5)));
    await waitFor(() => viewer.frames.length === 1);
    const oldOnMessage = oldSocket.onmessage;
    f.state.visibility = 'hidden';
    f.listeners.document.get('visibilitychange')();
    await pause(10);
    assert.equal(f.requests.length, 1);
    f.state.visibility = 'visible';
    f.listeners.document.get('visibilitychange')();
    await waitFor(() => f.sockets.length === 2);
    const socket = await f.activate('snake-free', 'nonce-2');
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1].parsed.resumeTicket, 'ticket-1');
    oldOnMessage({ data: JSON.stringify(await signed(f.frame(99))) });
    await pause(15);
    assert.equal(viewer.frames.length, 1);
    socket.emit(await signed(f.frame(6)));
    await waitFor(() => viewer.frames.length === 2);
    assert.ok(socket.sent[0].sequence > oldSocket.sent.at(-1).sequence);
    assert.ok(socket.sent.every(message => message.nonce === 'nonce-2' && message.ticket === 'ticket-2'));
  } finally { f.cleanup(); }
});

test('different rooms do not share sequence or close a healthy sibling on reconnect', async () => {
  const f = await fixture();
  try {
    f.watch('snake-free'); f.watch('snake-theme');
    const first = await f.activate();
    const sibling = await f.activate('snake-theme');
    assert.equal(f.requests.length, 1);
    first.disconnect();
    await waitFor(() => f.sockets.length === 3);
    const replacement = await f.activate('snake-free', 'new-room-nonce');
    assert.equal(sibling.readyState, 1);
    assert.equal(f.requests.length, 2);
    assert.equal(await f.transport.sendHostIntent('snake-theme', { type: 'profile', name: 'same-room' }), 'ok');
    assert.equal(sibling.sent.at(-1).ticket, 'ticket-1');
    assert.equal(replacement.sent[0].ticket, 'ticket-2');
  } finally { f.cleanup(); }
});

test('input coalesces latest coordinates at 20Hz and non-input actions stay ordered', async () => {
  const f = await fixture();
  try {
    f.watch('snake-free');
    const socket = await f.activate();
    const first = await f.transport.sendHostIntent('snake-free', { type: 'input', targetX: 1, targetY: 2 });
    assert.equal(first, 'ok');
    const pending = [
      f.transport.sendHostIntent('snake-free', { type: 'input', targetX: 2, targetY: 3 }),
      f.transport.sendHostIntent('snake-free', { type: 'input', targetX: 3, targetY: 4 }),
      f.transport.sendHostIntent('snake-free', { type: 'input', targetX: 9, targetY: 10 }),
      f.transport.sendHostIntent('snake-free', { type: 'settle_word', candidateIndex: 0 }),
      f.transport.sendHostIntent('snake-free', { type: 'settle_sentence', candidateIndex: 0 }),
    ];
    assert.deepEqual(await Promise.all(pending), ['ok', 'ok', 'ok', 'ok', 'ok']);
    const playerMessages = socket.sent.filter(message => !['watch', 'request_state'].includes(message.body.type));
    assert.deepEqual(playerMessages.map(message => message.body.type), ['input', 'input', 'settle_word', 'settle_sentence']);
    assert.equal(playerMessages[1].body.targetX, 9);
    f.state.visibility = 'hidden';
    assert.equal(await f.transport.sendHostIntent('snake-free', { type: 'input', targetX: 12, targetY: 10 }), 'error');
  } finally { f.cleanup(); }
});

test('explicit fallback mode uses only broadcast channels, signed frames and intents, never presence', async () => {
  const f = await fixture('fallback');
  try {
    const viewer = f.watch('snake-free');
    await waitFor(() => f.channels.length === 1 && f.channels[0].sent.length === 2);
    const channel = f.channels[0];
    assert.equal(channel.name, 'ransen:snake-free');
    assert.equal(f.sockets.length, 0);
    assert.deepEqual(channel.registrations, [{ type: 'broadcast', filter: { event: 'host_frame' } }]);
    assert.equal('presence' in channel.options.config, false);
    const connectionsBefore = [...viewer.connections];
    const writesBefore = channel.sent.length;
    channel.emit({ type: 'challenge', nonce: 'attacker', fence: 999 });
    channel.emit(f.frame(999));
    channel.emit({ type: 'state', room: 'snake-free', signature: 'fake' });
    await pause(20);
    assert.deepEqual(viewer.connections, connectionsBefore);
    assert.equal(channel.sent.length, writesBefore);
    assert.equal(f.requests.length, 1);
    channel.emit(await signed(f.frame(1)));
    await waitFor(() => viewer.frames.length === 1);
    assert.equal(await f.transport.sendHostIntent('snake-free', { type: 'profile', name: 'guest' }), 'ok');
    assert.equal(channel.sent.at(-1).event, 'user_intent');
    assert.equal(channel.sent.at(-1).payload.nonce, 'fallback-1');
  } finally { f.cleanup(); }
});

test('Shanghai socket failure does not elect player/fallback or start database polling', async () => {
  const f = await fixture();
  try {
    const viewer = f.watch('snake-free');
    const socket = await f.activate();
    f.state.failSession = true;
    socket.disconnect();
    await waitFor(() => viewer.connections.at(-1) === 'error');
    assert.equal(await f.transport.sendHostIntent('snake-free', { type: 'input', targetX: 20, targetY: 30 }), 'error');
    assert.equal(await f.transport.sendHostIntent('snake-free', { type: 'profile', name: 'outage' }), 'error');
    await pause(40);
    assert.equal(f.channels.length, 0);
    assert.equal(f.requests.length, 1);
    assert.ok(f.requests.every(request => request.method === 'POST' && request.url === '/api/game-session'));
  } finally { f.cleanup(); }
});

test('an intent queued before challenge waits for the existing socket and unsubscribe prevents later writes', async () => {
  const f = await fixture();
  try {
    const viewer = f.watch('snake-free');
    await waitFor(() => f.sockets.length === 1);
    const pending = f.transport.sendHostIntent('snake-free', { type: 'profile', name: 'early' });
    await pause(15);
    assert.equal(f.sockets.length, 1);
    assert.equal(f.sockets[0].sent.length, 0);
    const socket = await f.activate();
    assert.equal(await pending, 'ok');
    await waitFor(() => socket.sent.length === 3);
    assert.equal(socket.sent.filter(message => message.body.type === 'profile').length, 1);
    const oldMessage = socket.onmessage;
    f.cleanup();
    oldMessage({ data: JSON.stringify(await signed(f.frame(1))) });
    await pause(15);
    assert.equal(viewer.frames.length, 0);
    assert.equal(socket.readyState, 3);
    assert.equal(socket.sent.length, 3);
  } finally { f.cleanup(); }
});

test.after(() => hooks.deregister());

test('signed admission confirmation reports server rejection and success without blocking input', async () => {
  const f = await fixture();
  try {
    f.watch('snake-free');
    const socket = await f.activate();
    let settled = false;
    const join = f.transport.sendHostIntent('snake-free', { type:'join', name:'guest', color:'#123456', isSpectator:false }).then(result => { settled=true; return result; });
    await waitFor(() => socket.sent.some(packet => packet.body.type === 'join'));
    const request = socket.sent.find(packet => packet.body.type === 'join');
    assert.equal(await f.transport.sendHostIntent('snake-free', {type:'input', targetX:10, targetY:20}), 'ok');
    assert.equal(settled, false);
    const result = {type:'intent_result',room:'snake-free',fence:1,seq:10,serverNow:10_000,playerId:'server-player',requestSequence:request.sequence,ok:true};
    socket.emit(result);
    await pause(15);
    assert.equal(settled,false,'Unsigned admission acknowledgement must be ignored');
    socket.emit(await signed({...result,playerId:'another-player'}));
    await pause(15);
    assert.equal(settled,false,'Acknowledgement must name this guest');
    socket.emit(await signed({...result,ok:false,code:'ROOM_FULL'}));
    assert.equal(await join,'error');
    const retry = f.transport.sendHostIntent('snake-free',{type:'join',name:'guest',color:'#123456',isSpectator:false});
    await waitFor(() => socket.sent.filter(packet=>packet.body.type==='join').length===2);
    const second=socket.sent.filter(packet=>packet.body.type==='join').at(-1);
    socket.emit(await signed({...result,seq:11,requestSequence:second.sequence,ok:true}));
    assert.equal(await retry,'ok');
  } finally { f.cleanup(); }
});

test('disconnect resolves pending admission as failed rather than leaving a false success', async () => {
  const f=await fixture();
  try {
    f.watch('snake-free');
    const socket=await f.activate();
    const join=f.transport.sendHostIntent('snake-free',{type:'join',name:'guest',color:'#123456',isSpectator:false});
    await waitFor(()=>socket.sent.some(packet=>packet.body.type==='join'));
    socket.disconnect();
    assert.equal(await join,'error');
  } finally {f.cleanup();}
});
