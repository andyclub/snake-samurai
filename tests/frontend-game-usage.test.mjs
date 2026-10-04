import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildSync, transformSync } = require('esbuild');
const code = buildSync({
  entryPoints: [new URL('../frontend/gameUsage.ts', import.meta.url).pathname],
  bundle: true, platform: 'browser', format: 'cjs', write: false, logLevel: 'silent',
}).outputFiles[0].text;
const options = { runId: 'test-only-run', variant: 'candidate', game: 'snake', collectorId: 'test-browser', real: false };
function fixture(fetchImpl = async () => new Response('返事')) {
  let time = 100;
  class Socket extends EventTarget {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    constructor(url, protocols) { super(); this.url = String(url); this.protocols = protocols; this.readyState = 1; this.sent = []; }
    send(data) { if (this.readyState !== 1) throw new Error('closed'); this.sent.push(data); }
    receive(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  const context = vm.createContext({
    module: { exports: {} }, exports: {}, fetch: fetchImpl, WebSocket: Socket,
    performance: { now: () => time }, location: { href: 'https://test-only.invalid/' },
    URL, URLSearchParams, Request, Response, Blob, TextEncoder, TextDecoder,
    ArrayBuffer, Uint8Array, EventTarget, Event, MessageEvent, console,
  });
  vm.runInContext(code, context);
  return { context, Socket, fetchImpl, api: context.module.exports, advance: ms => { time += ms; } };
}
const bytes = value => new TextEncoder().encode(value).length;
const json = value => JSON.stringify(value);

test('disabled/invalid configuration does not wrap or mark inactive coverage', async () => {
  const { context, Socket, fetchImpl, api } = fixture();
  assert.equal(await api.getGameUsageReport(), null);
  assert.equal(Object.hasOwn(context, '__GAME_USAGE__'), false);
  assert.equal(api.installGameUsage(), false);
  assert.equal(api.installGameUsage({ ...options, runId: 'https://secret.invalid/' }), false);
  assert.equal(api.installGameUsage({ ...options, game: 'unknown' }), false);
  assert.equal(context.fetch, fetchImpl);
  assert.equal(context.WebSocket, Socket);
  assert.equal(api.installGameUsage(options), true);
  assert.equal(api.installGameUsage(options), false);
  assert.deepEqual(Array.from((await api.getGameUsageReport()).coverage), []);
  api.stopGameUsage();
});

test('fetch counts all page calls and UTF8 bodies, flushes pending response bytes, retains payload scope', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const native = async () => ({ ok: true, clone: () => ({ arrayBuffer: () => pending }) });
  const { context, api, advance } = fixture(native);
  api.installGameUsage(options);
  await context.fetch('https://test-only.invalid/rest/v1/secret-table', { method: 'POST', body: '日本' });
  let settled = false;
  const reportPromise = context.__GAME_USAGE__.getReport().then(report => { settled = true; return report; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false);
  finish(new Uint8Array(9).buffer);
  advance(2400);
  const report = await reportPromise;
  const post = report.bySourceGame.frontend.snake.http.methods.POST;
  assert.equal(post.requests, 1); assert.equal(post.responses, 1);
  assert.equal(post.requestBytes, 6); assert.equal(post.responseBytes, 9);
  assert.equal(report.durationMs, 2400);
  assert.equal(report.byteScope, 'payload');
  assert.equal(report.real, false);
  assert.equal(report.pageGame, 'snake');
  const serialized = JSON.stringify(report);
  for (const value of ['secret-table', 'test-only.invalid', '日本']) assert.equal(serialized.includes(value), false);
  api.stopGameUsage();
});

test('HTTP Supabase and same-origin API GET are attributed to this page with no hidden polling', async () => {
  const { context, api } = fixture();
  api.installGameUsage(options);
  await context.fetch('https://test-only.invalid/rest/v1/rooms');
  await context.fetch('/api/game-session', { method: 'POST', body: '{}' });
  await context.fetch('/api/game-command', { method: 'POST', body: '{}' });
  const report = await api.getGameUsageReport();
  assert.equal(report.byGame.snake.http.methods.GET.requests, 1);
  assert.equal(report.byGame.snake.http.methods.POST.requests, 2);
  assert.equal(report.total.http.methods.GET.responseBytes, 6);
  assert.equal(report.byGame.ransen.http.methods.GET, undefined);
  assert.deepEqual(Array.from(report.coverage), ['frontend/snake']);
  api.stopGameUsage();
});

test('raw Realtime records heartbeat, joins, leave, ACK and cross-game channel messages exactly once', async () => {
  const { context, api } = fixture();
  api.installGameUsage(options);
  const socket = new context.WebSocket('wss://test-only.invalid/realtime/v1/websocket?apikey=test-public');
  const heartbeat = json({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: '1' });
  const join = json({ topic: 'realtime:ransen:main', event: 'phx_join', payload: {} });
  const leave = json({ topic: 'realtime:ransen:bousai-toyama', event: 'phx_leave', payload: {} });
  const ack = json({ topic: 'realtime:ransen:main', event: 'phx_reply', payload: { status: 'ok' } });
  const snakeFrame = json(['1', '2', 'realtime:ransen:snake-theme', 'broadcast', { payload: { room: 'snake-theme' } }]);
  socket.send(heartbeat); socket.receive(heartbeat);
  socket.send(join); socket.send(leave); socket.receive(ack); socket.receive(snakeFrame);
  const report = await api.getGameUsageReport();
  assert.equal(report.byGame.snake.realtime.sent.messages, 1);
  assert.equal(report.byGame.snake.realtime.sent.bytes, bytes(heartbeat));
  assert.equal(report.byGame.snake.realtime.received.messages, 2);
  assert.equal(report.byGame.snake.realtime.received.bytes, bytes(heartbeat) + bytes(snakeFrame));
  assert.equal(report.byGame.ransen.realtime.sent.messages, 2);
  assert.equal(report.byGame.ransen.realtime.sent.bytes, bytes(join) + bytes(leave));
  assert.equal(report.byGame.ransen.realtime.received.bytes, bytes(ack));
  assert.equal(report.total.realtime.sent.messages, 3);
  assert.equal(report.total.realtime.received.messages, 3);
  assert.equal(report.roomBreakdown.main.realtime.sent.messages, 1);
  assert.equal(report.roomBreakdown['bousai-toyama'].realtime.sent.messages, 1);
  assert.equal(report.roomBreakdown['snake-theme'].realtime.received.messages, 1);
  assert.equal(report.roomBreakdown.unassigned.realtime.sent.messages, 1);
  assert.equal(report.pageTotal.realtime.sent.messages, 3);
  assert.equal(JSON.stringify(report).includes('apikey'), false);
  api.stopGameUsage();
});

test('game WSS bytes preserve native prototype/constants/protocols and SDK-style event listeners', async () => {
  const { context, Socket, api } = fixture();
  const originalSend = Socket.prototype.send;
  api.installGameUsage(options);
  assert.equal(context.WebSocket.prototype, Socket.prototype);
  for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) assert.equal(context.WebSocket[key], Socket[key]);
  const socket = new context.WebSocket('wss://test-only.invalid/api/game-ws?room=snake-free', ['test-protocol']);
  assert.ok(socket instanceof Socket);
  assert.ok(socket instanceof context.WebSocket);
  assert.deepEqual(socket.protocols, ['test-protocol']);
  let seen = 0;
  socket.addEventListener('message', () => { seen++; });
  socket.send('日本');
  socket.send(new Uint8Array([1, 2, 3]));
  socket.receive(new Blob(['返事']));
  assert.equal(seen, 1);
  class Subclass extends context.WebSocket {}
  assert.ok(new Subclass('wss://test-only.invalid/api/game-ws') instanceof Subclass);
  const report = await api.getGameUsageReport();
  assert.equal(report.byGame.snake.wss.sentBytes, 9);
  assert.equal(report.byGame.snake.wss.receivedBytes, 6);
  assert.equal(report.roomBreakdown['snake-free'].wss.sentBytes, 9);
  api.stopGameUsage();
  assert.equal(socket.send, originalSend);
  assert.equal(Socket.prototype.send, originalSend);
});

test('stop restores only owned wrappers, stops existing socket counters and freezes elapsed duration', async () => {
  const { context, Socket, fetchImpl, api, advance } = fixture();
  api.installGameUsage(options);
  const staleFetch = context.fetch;
  const staleSocket = context.WebSocket;
  const socket = new context.WebSocket('wss://test-only.invalid/api/game-ws?room=main');
  socket.send('a');
  advance(500);
  api.stopGameUsage();
  assert.equal(context.fetch, fetchImpl);
  assert.equal(context.WebSocket, Socket);
  assert.equal(Object.hasOwn(context, '__GAME_USAGE__'), false);
  socket.send('after-stop'); socket.receive('after-stop');
  await staleFetch('/not-measured-after-stop');
  const later = new staleSocket('wss://test-only.invalid/api/game-ws');
  assert.equal(Object.hasOwn(later, 'send'), false);
  advance(500);
  const stopped = await api.getGameUsageReport();
  assert.equal(stopped.durationMs, 500);
  assert.equal(stopped.total.wss.sentBytes, 1);
  assert.equal(stopped.total.wss.receivedBytes, 0);
  assert.equal(stopped.total.http.methods.GET, undefined);
  const foreignBridge = { owner: 'external-test-only' };
  context.__GAME_USAGE__ = foreignBridge;
  api.installGameUsage(options);
  assert.equal(context.__GAME_USAGE__, foreignBridge);
  const foreignFetch = async () => new Response('outside');
  class ForeignSocket extends Socket {}
  context.fetch = foreignFetch; context.WebSocket = ForeignSocket;
  const foreignSend = () => {};
  socket.send = foreignSend;
  api.stopGameUsage();
  assert.equal(context.fetch, foreignFetch);
  assert.equal(context.WebSocket, ForeignSocket);
  assert.equal(socket.send, foreignSend);
  assert.equal(context.__GAME_USAGE__, foreignBridge);
});

test('actual entry bootstrap wraps transports before SDK module evaluation captures them', () => {
  const entry = readFileSync(new URL('../frontend/index.tsx', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../frontend/gameUsageBootstrap.ts', import.meta.url), 'utf8');
  const game = bootstrap.includes("game === 'snake'") ? 'snake' : 'ransen';
  const compiled = transformSync(entry, { loader: 'tsx', format: 'cjs' }).code;
  const bootstrapCode = transformSync(bootstrap, { loader: 'ts', format: 'cjs' }).code;
  for (const [config, enabled] of [
    [undefined, false], [{ ...options, game }, true],
    [{ ...options, game: game === 'snake' ? 'ransen' : 'snake' }, false],
    [{ ...options, game, runId: 'invalid task label/' }, false],
  ]) {
    const { context, api, fetchImpl } = fixture();
    const calls = [];
    let sdkFetch;
    const React = { createElement: () => ({}), StrictMode: 'strict' };
    context.__GAME_MEASUREMENT__ = config;
    context.document = { getElementById: () => ({}) };
    context.require = name => {
      if (name.includes('gameUsageBootstrap')) {
        calls.push('bootstrap');
        vm.runInContext(bootstrapCode, context);
        return {};
      }
      if (name === './gameUsage') return api;
      if (name.includes('vertex-ai-proxy')) { calls.push('vertex'); return {}; }
      if (name === './App') { calls.push('sdk-evaluation'); sdkFetch = context.fetch; return {}; }
      if (name.includes('react-dom')) return { createRoot: () => ({ render: () => calls.push('render') }) };
      return name === 'react' ? React : {};
    };
    vm.runInContext(compiled, context);
    assert.equal(calls[0], 'bootstrap');
    assert.ok(calls.indexOf('bootstrap') < calls.indexOf('vertex'));
    assert.ok(calls.indexOf('bootstrap') < calls.indexOf('sdk-evaluation'));
    assert.equal(calls.at(-1), 'render');
    assert.equal(sdkFetch === fetchImpl, !enabled);
    api.stopGameUsage();
  }
});

async function proxyReport(collectorId, sequence, requests = 1, overrides = {}) {
  const { UsageMeter } = await import('../room-director/usage-meter.mjs');
  const meter = new UsageMeter({ ...options, collectorId, durationMs: 250, real: true });
  for (let i = 0; i < requests; i++) meter.recordHttp({ source: 'relay', game: 'snake',
    method: 'POST', requestBytes: 3, responseBytes: 5, transport: 'host-http-upstream' });
  return { ...(await meter.report()), sequence, ...overrides };
}
const proxyResponse = header => new Response('ok', { headers: header == null ? {} : { 'x-game-proxy-usage': header } });

test('proxy cumulative reports retain only latest sequence per collector without adding frontend counters', async () => {
  const headers = [
    await proxyReport('relay-a', 1), await proxyReport('relay-a', 3, 3),
    await proxyReport('relay-a', 2, 2), await proxyReport('relay-a', 3, 99),
    await proxyReport('relay-b', 1, 2),
  ].map(JSON.stringify);
  const { context, api, advance } = fixture(async () => proxyResponse(headers.shift()));
  api.installGameUsage(options);
  for (let i = 0; i < 5; i++) await context.fetch('/api/game-command', { method: 'POST', body: '{}' });
  advance(3600000);
  const report = await api.getGameUsageReport();
  assert.equal(report.proxyReports.length, 2);
  assert.deepEqual(Array.from(report.proxyReports, item => item.collectorIds[0]), ['relay-a', 'relay-b']);
  assert.equal(report.proxyReports[0].sequence, 3);
  assert.equal(report.proxyReports[0].total.http.methods.POST.requests, 3);
  assert.equal(report.proxyReports[1].total.http.methods.POST.requests, 2);
  assert.equal(report.proxyReports[0].durationMs, 250);
  assert.equal(report.durationMs, 3600000);
  assert.equal(report.proxyAggregationScope, 'external-complete-window-aggregation-required');
  assert.equal(report.total.http.methods.POST.requests, 5);
  assert.equal(report.bySourceGame.relay.snake.http.methods.POST, undefined);
  assert.equal(report.measurementErrors, 0);
  report.proxyReports[0].total.http.methods.POST.requests = 999;
  assert.equal((await api.getGameUsageReport()).proxyReports[0].total.http.methods.POST.requests, 3);
  api.stopGameUsage();
});

test('optional proxy header rejects malformed/mismatched reports without retaining arbitrary data', async () => {
  const good = await proxyReport('relay-safe', 1);
  const headers = [null, '{secret-body', JSON.stringify({ ...good, runId: 'wrong-run' }),
    JSON.stringify({ ...good, variant: 'wrong-variant' }),
    JSON.stringify({ ...good, total: { secret: 'private-body' } }),
    JSON.stringify({ ...good, coverage: ['https://secret.invalid/key'] }),
    JSON.stringify({ ...good, extra: { url: 'https://secret.invalid/key', body: 'private-body' } })];
  const { context, api } = fixture(async () => proxyResponse(headers.shift()));
  api.installGameUsage(options);
  for (let i = 0; i < 7; i++) await context.fetch('/api/game-session');
  const report = await api.getGameUsageReport();
  assert.equal(report.measurementErrors, 5);
  assert.equal(report.proxyReports.length, 1);
  for (const secret of ['secret-body', 'private-body', 'secret.invalid', 'wrong-run', 'wrong-variant', '"extra"'])
    assert.equal(JSON.stringify(report).includes(secret), false);
  api.stopGameUsage();
});

test('stop skips proxy collection from in-flight responses and cached SDK wrappers', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  let reads = 0;
  const raw = JSON.stringify(await proxyReport('relay-after-stop', 1));
  const response = { ok: true, headers: { get: () => { reads++; return raw; } },
    clone: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) };
  const { context, api } = fixture(async () => pending);
  api.installGameUsage(options);
  const cached = context.fetch;
  const request = cached('/api/game-session');
  await Promise.resolve(); await Promise.resolve();
  api.stopGameUsage();
  finish(response);
  await request;
  await cached('/api/game-session');
  assert.equal(reads, 0);
  assert.equal((await api.getGameUsageReport()).proxyReports.length, 0);
});
