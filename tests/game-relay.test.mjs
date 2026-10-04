import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import https from 'node:https';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require('ws');
const { createGameRelay } = require('../frontend/server/game-relay.cjs');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'ws://127.0.0.1:' + server.address().port;
}
async function message(ws) {
  const [data] = await once(ws, 'message');
  return data.toString();
}
async function connect(url, options) {
  const ws = new WebSocket(url, options);
  const ready = message(ws);
  await once(ws, 'open');
  return { ws, ready: await ready };
}

test('preview probe identifies build, echoes, and reconnects', { timeout: 5000 }, async t => {
  const samples = [];
  const server = createGameRelay({ previewProbe: true, buildSha: 'test-sha', meter: { recordWss: sample => samples.push(sample) } });
  const base = await listen(server);
  t.after(() => server.close());
  for (let i = 0; i < 2; i++) {
    const { ws, ready } = await connect(base + '/api/game-ws?probe=1');
    assert.deepEqual(JSON.parse(ready), { type: 'probe_ready', buildSha: 'test-sha' });
    const received = message(ws);
    ws.send('client-' + i);
    assert.equal(await received, 'client-' + i);
    ws.close();
    await once(ws, 'close');
  }
  assert.equal(samples.filter(sample => sample.direction === 'received').length, 2);
  assert.equal(samples.filter(sample => sample.direction === 'sent').length, 4);
  assert.ok(samples.every(sample => sample.transport === 'ws-client'));
  assert.equal(samples.filter(sample => sample.direction === 'sent').reduce((sum, sample) => sum + sample.bytes, 0),
    2 * Buffer.byteLength(JSON.stringify({ type: 'probe_ready', buildSha: 'test-sha' })) + 16);
});

test('production cannot use probe or unconfigured relay', { timeout: 5000 }, async t => {
  const server = createGameRelay();
  const base = await listen(server);
  t.after(() => server.close());
  const ws = new WebSocket(base + '/api/game-ws?probe=1');
  const [error] = await once(ws, 'error');
  assert.match(error.message, /503/);
});

test('bidirectional relay preserves bytes and closes after host disconnect', { timeout: 5000 }, async t => {
  const host = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(host, 'listening');
  t.after(() => host.close());
  host.on('connection', (ws, req) => {
    assert.equal(req.headers['x-game-relay-key'], 'test-key');
    assert.equal(req.headers['x-game-room'], 'snake-free');
    ws.on('message', (data, binary) => ws.send(data, { binary }));
  });
  const samples = [];
  const server = createGameRelay({
    meter: { recordWss: sample => samples.push(sample) },
    upstreamUrl: 'ws://127.0.0.1:' + host.address().port,
    relayKey: 'test-key', allowLocalUpstream: true
  });
  const base = await listen(server);
  t.after(() => server.close());
  const { ws, ready } = await connect(base + '/api/game-ws?room=snake-free');
  assert.equal(JSON.parse(ready).type, 'relay_ready');
  const received = once(ws, 'message');
  const bytes = Buffer.from([0, 255, 17, 128]);
  ws.send(bytes);
  const [actual, binary] = await received;
  assert.equal(binary, true);
  assert.deepEqual(actual, bytes);
  await new Promise(resolve => setImmediate(resolve));
  const sum = (transport, direction) => samples.filter(sample => sample.transport === transport && sample.direction === direction)
    .reduce((total, sample) => total + sample.bytes, 0);
  assert.equal(sum('ws-client', 'received'), 4);
  assert.equal(sum('ws-upstream', 'sent'), 4);
  assert.equal(sum('ws-upstream', 'received'), 4);
  assert.equal(sum('ws-client', 'sent'), Buffer.byteLength(ready) + 4);
  assert.ok(samples.every(sample => sample.source === 'relay' && sample.game === (JSON.parse(ready).room.startsWith('snake-') ? 'snake' : 'ransen')));
  assert.equal(JSON.stringify(samples).includes('test-key'), false);
  const closed = once(ws, 'close');
  for (const peer of host.clients) peer.close();
  assert.equal((await closed)[0], 1013);
});

test('rejects non-local insecure upstream and forged browser origin', { timeout: 5000 }, async t => {
  assert.throws(() => createGameRelay({ upstreamUrl: 'ws://example.com' }), /WSS/);
  const server = createGameRelay({ previewProbe: true });
  const base = await listen(server);
  t.after(() => server.close());
  const ws = new WebSocket(base + '/api/game-ws?probe=1', { origin: 'https://attacker.example' });
  const [error] = await once(ws, 'error');
  assert.match(error.message, /403/);
});

test('WSS validates a test certificate only with its trusted CA', { timeout: 10000 }, async t => {
  const cache = fileURLToPath(new URL('../node_modules/.cache/', import.meta.url));
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(join(cache, 'game-relay-tls-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const certificate = (name, subjectAltName = 'IP:127.0.0.1') => {
    const key = join(directory, name + '.key'), cert = join(directory, name + '.crt');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=game-relay-test-only',
      '-addext', 'subjectAltName=' + subjectAltName], { stdio: 'ignore' });
    return { key: readFileSync(key), cert: readFileSync(cert), certPath: cert };
  };
  const trusted = certificate('trusted'), unrelated = certificate('unrelated');
  const hostServer = https.createServer({ key: trusted.key, cert: trusted.cert });
  const host = new WebSocketServer({ server: hostServer });
  let hostConnections = 0;
  host.on('connection', peer => {
    hostConnections++;
    peer.on('message', (data, binary) => peer.send(data, { binary }));
  });
  await listen(hostServer);
  t.after(async () => {
    for (const peer of host.clients) peer.terminate();
    await new Promise(resolve => host.close(resolve));
    await new Promise(resolve => hostServer.close(resolve));
  });
  const upstreamUrl = 'wss://127.0.0.1:' + hostServer.address().port;
  const mismatch = certificate('hostname-mismatch', 'DNS:wrong.test');
  const mismatchServer = https.createServer({ key: mismatch.key, cert: mismatch.cert });
  const mismatchHost = new WebSocketServer({ server: mismatchServer });
  let mismatchConnections = 0;
  mismatchHost.on('connection', () => { mismatchConnections++; });
  await listen(mismatchServer);
  t.after(async () => {
    for (const peer of mismatchHost.clients) peer.terminate();
    await new Promise(resolve => mismatchHost.close(resolve));
    await new Promise(resolve => mismatchServer.close(resolve));
  });
  const mismatchUrl = 'wss://127.0.0.1:' + mismatchServer.address().port;
  for (const [ca, accepted, target] of [
    [trusted.cert, true, upstreamUrl], [undefined, false, upstreamUrl],
    [unrelated.cert, false, upstreamUrl], [mismatch.cert, false, mismatchUrl],
  ]) {
    const server = createGameRelay({ upstreamUrl: target, relayKey: 'test-only-relay-key', ca });
    const base = await listen(server);
    t.after(() => new Promise(resolve => server.close(resolve)));
    const client = new WebSocket(base + '/api/game-ws?room=snake-free');
    t.after(() => client.terminate());
    if (accepted) {
      const ready = message(client);
      await once(client, 'open');
      assert.equal(JSON.parse(await ready).type, 'relay_ready');
      const echoed = message(client);
      client.send('test-only-tls-payload');
      assert.equal(await echoed, 'test-only-tls-payload');
      const closed = once(client, 'close');
      client.close();
      await closed;
    } else {
      let received = false;
      client.on('message', () => { received = true; });
      const closed = once(client, 'close');
      await once(client, 'open');
      assert.equal((await closed)[0], 1013);
      assert.equal(received, false, 'Untrusted upstream must not become ready');
    }
  }
  assert.equal(hostConnections, 1, 'Only the CA-verified connection reaches the host');
  assert.equal(mismatchConnections, 0, 'Trusted certificates still require a matching hostname');
});
