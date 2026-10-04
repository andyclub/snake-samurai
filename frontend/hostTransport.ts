import { acceptPlayerHostFrame, stopPlayerHostRoom } from './playerHostRuntime.ts';
export type HostConnection = 'connecting' | 'online' | 'error';
export interface HostConnectionFailure {
  code: string;
  status: number | null;
  operation: 'session' | 'connection';
  at: string;
}
export interface HostIdentity {
  ok: true;
  ticket: string;
  playerId: string;
  publicKey: JsonWebKey;
  statePublicKey: JsonWebKey;
  fencingToken: number;
  mode: 'shanghai' | 'fallback' | 'player';
  nonce?: string;
  designatedPlayerId?: string;
}
export interface HostFrame {
  type: 'state';
  room: string;
  fence: number;
  seq: number;
  serverNow: number;
  snapshot: Record<string, unknown>;
  players: unknown[];
}
type Body = Record<string, unknown>;
type Subscriber = { onFrame: (frame: HostFrame) => void; onConnection: (state: HostConnection, failure?: HostConnectionFailure) => void };
type Session = { identity: HostIdentity; signer: CryptoKey; verifier: CryptoKey };
type IntentResult = 'ok' | 'error';
type SendResult = { sent: IntentResult; accepted?: Promise<IntentResult> };
type Acceptance = { resolve: (result: IntentResult) => void; timer: ReturnType<typeof setTimeout> };
type Channel = {
  on: (type: string, filter: { event: string }, callback: (message: { payload: unknown }) => void) => Channel;
  subscribe: (callback: (status: string) => void) => Channel;
  send: (message: unknown) => Promise<string>;
  unsubscribe: () => Promise<unknown>;
};
type Room = {
  id: string; subscribers: Set<Subscriber>; connection: HostConnection; failure?: HostConnectionFailure;
  generation: number; session?: Session; socket?: WebSocket; channel?: Channel; nonce?: string;
  starting?: Promise<void>; queue: Promise<void>; incoming: Promise<void>; sequence: number;
  frame?: HostFrame; requireFull: boolean; requestingFull: boolean; retry: number;
  reconnectTimer?: ReturnType<typeof setTimeout>; handshakeTimer?: ReturnType<typeof setTimeout>; heartbeatTimer?: ReturnType<typeof setInterval>;
  readyWaiters: Array<(ready: boolean) => void>;
  pendingInput?: { body: Body; waiters: Array<(result: IntentResult) => void> };
  acceptances: Map<number, Acceptance>;
  lastInputAt: number; invalidFrames: number; lastInvalidWarningAt: number;
};

const rooms = new Map<string, Room>();
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const encoder = new TextEncoder();
const KEY_STORE = 'kazeabc.guest-signing-key.v1';
const TICKET_STORE = 'kazeabc.guest-session-ticket.v1';
let keyPromise: Promise<{ publicKey: JsonWebKey; signer: CryptoKey }> | undefined;
let sessionPromise: Promise<Session> | undefined;
let currentSession: Session | undefined;
let listenersInstalled = false;

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const object = (value: unknown): value is Body => value !== null && typeof value === 'object' && !Array.isArray(value);
const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
const copy = <T>(value: T): T => structuredClone(value);
function safeTree(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  return Object.entries(value).every(([key, child]) => !forbidden.has(key) && safeTree(child));
}
function readStorage(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}
function writeStorage(key: string, value: string) {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* Session remains usable in memory. */ }
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decodeSignature(value: unknown): Uint8Array<ArrayBuffer> | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const encoded = value.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Uint8Array.from(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)), char => char.charCodeAt(0));
    return decoded.length === 64 ? decoded : null;
  } catch { return null; }
}
function p256(value: unknown): value is JsonWebKey {
  return object(value) && value.kty === 'EC' && value.crv === 'P-256' && nonempty(value.x) && nonempty(value.y) && !('d' in value);
}
async function keys() {
  if (!keyPromise) keyPromise = (async () => {
    const stored = readStorage(KEY_STORE);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (p256(parsed.publicKey) && object(parsed.privateKey) && nonempty(parsed.privateKey.d)) {
          const signer = await crypto.subtle.importKey('jwk', parsed.privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
          return { publicKey: parsed.publicKey as JsonWebKey, signer };
        }
      } catch { /* A corrupt guest key is replaced; it never grants host authority. */ }
    }
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const privateKey = await crypto.subtle.exportKey('jwk', pair.privateKey);
    // Guest proof key stays on this device. Only publicKey enters any request.
    writeStorage(KEY_STORE, JSON.stringify({ publicKey, privateKey }));
    return { publicKey, signer: pair.privateKey };
  })().catch(error => { keyPromise = undefined; throw error; });
  return keyPromise;
}
const sessionFailureCodes = new Set([
  'HOST_NOT_CONFIGURED', 'HOST_MODE_UNAVAILABLE', 'SELECTED_HOST_UNAVAILABLE',
  'HOST_RESPONSE_FAILED', 'HOST_UNAVAILABLE', 'METHOD_NOT_ALLOWED', 'NOT_FOUND',
  'REQUEST_TOO_LARGE', 'INVALID_REQUEST',
]);
function connectionFailure(code: string, operation: HostConnectionFailure['operation'], status: number | null = null): HostConnectionFailure {
  return { code, status, operation, at: new Date().toISOString() };
}
class HostFailureError extends Error {
  readonly failure: HostConnectionFailure;
  constructor(failure: HostConnectionFailure) { super(failure.code); this.failure = failure; }
}
async function session(refresh = false): Promise<Session> {
  if (!refresh && currentSession) return currentSession;
  if (!sessionPromise) sessionPromise = (async () => {
    const key = await keys();
    const resumeTicket = readStorage(TICKET_STORE);
    const response = await fetch('/api/game-session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey: key.publicKey, ...(resumeTicket ? { resumeTicket } : {}) }),
      signal: AbortSignal.timeout(8_000),
    });
    const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new HostFailureError(connectionFailure(response.ok ? 'SESSION_INVALID' : 'SESSION_FAILED', 'session', status)); }
    if (!response.ok) {
      const code = object(data) && typeof data.code === 'string' && sessionFailureCodes.has(data.code) ? data.code : 'SESSION_FAILED';
      throw new HostFailureError(connectionFailure(code, 'session', status));
    }
    if (!object(data) || data.ok !== true || !nonempty(data.ticket) || !nonempty(data.playerId)
      || !p256(data.statePublicKey) || !integer(data.fencingToken)
      || (data.mode !== 'shanghai' && data.mode !== 'fallback' && data.mode !== 'player')
      || (data.mode !== 'shanghai' && !nonempty(data.nonce))
      || (data.designatedPlayerId !== undefined && !nonempty(data.designatedPlayerId))) throw new HostFailureError(connectionFailure('SESSION_INVALID', 'session', status));
    const identity: HostIdentity = {
      ok: true, ticket: data.ticket, playerId: data.playerId, publicKey: key.publicKey,
      statePublicKey: data.statePublicKey, fencingToken: data.fencingToken,
      mode: data.mode as HostIdentity['mode'],
      ...(typeof data.nonce === 'string' ? { nonce: data.nonce } : {}),
      ...(typeof data.designatedPlayerId === 'string' ? { designatedPlayerId: data.designatedPlayerId } : {}),
    };
    const verifier = await crypto.subtle.importKey('jwk', identity.statePublicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    writeStorage(TICKET_STORE, identity.ticket);
    currentSession = { identity, signer: key.signer, verifier };
    return currentSession;
  })().catch(error => {
    throw error instanceof HostFailureError ? error : new HostFailureError(connectionFailure('CONNECTION_LOST', 'session'));
  }).finally(() => { sessionPromise = undefined; });
  return sessionPromise;
}
export async function getHostIdentity(): Promise<HostIdentity> {
  return copy((await session()).identity);
}
function notifyConnection(room: Room, connection: HostConnection, failure?: HostConnectionFailure) {
  room.connection = connection;
  if (connection === 'online') room.failure = undefined;
  else if (failure) room.failure = copy(failure);
  for (const subscriber of room.subscribers) {
    try { subscriber.onConnection(connection, room.failure ? copy(room.failure) : undefined); } catch (error) { console.error('Host connection subscriber failed', error); }
  }
}
function invalidFrame(room: Room) {
  room.invalidFrames += 1;
  if (Date.now() - room.lastInvalidWarningAt >= 30_000) {
    room.lastInvalidWarningAt = Date.now();
    console.warn('Unsigned or invalid host frame discarded');
  }
}
function protocolError(room: Room) {
  room.failure = connectionFailure('PROTOCOL_ERROR', 'connection');
  // Authenticated malformed frames are observable without breaking a healthy
  // transport or allowing unauthenticated broadcasts to force reconnection.
  for (const subscriber of room.subscribers) {
    try { subscriber.onConnection('error', copy(room.failure!)); } catch (error) { console.error('Host protocol subscriber failed', error); }
  }
}
function notifyFrame(room: Room) {
  if (!room.frame) return;
  for (const subscriber of room.subscribers) {
    try { subscriber.onFrame(copy(room.frame)); } catch (error) { console.error('Host frame subscriber failed', error); }
  }
}
function resolveReady(room: Room, ready: boolean) {
  if (room.handshakeTimer) clearTimeout(room.handshakeTimer);
  room.handshakeTimer = undefined;
  room.readyWaiters.splice(0).forEach(resolve => resolve(ready));
}
function stopConnection(room: Room) {
  room.generation += 1;
  stopPlayerHostRoom(room.id);
  for (const pending of room.acceptances.values()) { clearTimeout(pending.timer); pending.resolve('error'); }
  room.acceptances.clear();
  const socket = room.socket;
  const channel = room.channel;
  room.socket = undefined; room.channel = undefined; room.nonce = undefined;
  if (room.heartbeatTimer) clearInterval(room.heartbeatTimer);
  room.heartbeatTimer = undefined;
  resolveReady(room, false);
  if (socket) { socket.onclose = null; socket.onerror = null; socket.close(); }
  if (channel) void channel.unsubscribe().catch(error => console.error('Host channel cleanup failed', error));
}
function scheduleReconnect(room: Room) {
  if (!room.subscribers.size || room.reconnectTimer) return;
  const delay = Math.min(30_000, 1_000 * 2 ** room.retry++);
  room.reconnectTimer = setTimeout(() => {
    room.reconnectTimer = undefined;
    if (visible()) void connect(room, true);
  }, delay);
}
function fail(room: Room, generation: number, failure = connectionFailure('CONNECTION_LOST', 'connection')) {
  if (room.generation !== generation) return;
  stopConnection(room);
  notifyConnection(room, 'error', failure);
  scheduleReconnect(room);
}
async function signedSend(room: Room, body: Body): Promise<SendResult> {
  const active = room.session;
  const nonce = room.nonce;
  const generation = room.generation;
  if (!active || !nonce || room.connection !== 'online') return { sent: 'error' };
  const envelope = { ticket: active.identity.ticket, nonce, sequence: ++room.sequence, room: room.id, body: copy(body) };
  let accepted: Promise<IntentResult> | undefined;
  const settle = (result: IntentResult) => {
    const pending = room.acceptances.get(envelope.sequence);
    if (pending) { clearTimeout(pending.timer); room.acceptances.delete(envelope.sequence); pending.resolve(result); }
  };
  try {
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, active.signer, encoder.encode(JSON.stringify(envelope)));
    if (room.generation !== generation || room.connection !== 'online') return { sent: 'error' };
    if (['join', 'host_snapshot', 'host_validate'].includes(String(body.type))) {
      accepted = new Promise(resolve => {
        const timer = setTimeout(() => settle('error'), body.type === 'join' ? 20_000 : 10_000);
        room.acceptances.set(envelope.sequence, { resolve, timer });
      });
    }
    const message = { ...envelope, signature: base64url(new Uint8Array(signature)) };
    if (room.socket?.readyState === WebSocket.OPEN) {
      room.socket.send(JSON.stringify(message));
      return { sent: 'ok', accepted };
    }
    if (room.channel && await room.channel.send({ type: 'broadcast', event: 'user_intent', payload: message }) === 'ok') {
      return { sent: 'ok', accepted };
    }
  } catch (error) { console.error('Host intent failed', error); }
  settle('error');
  return { sent: 'error' };
}
function requestFull(room: Room) {
  if (room.requestingFull) return;
  room.requestingFull = true;
  void queueBody(room, { type: 'request_state' }).then(result => { if (result !== 'ok') room.requestingFull = false; });
}
function ready(room: Room, generation: number) {
  if (room.generation !== generation) return;
  room.retry = 0;
  notifyConnection(room, 'online');
  resolveReady(room, true);
  void queueBody(room, { type: 'watch' });
  requestFull(room);
}
function applyPatch(snapshot: Record<string, unknown>, operations: unknown): Record<string, unknown> {
  if (!Array.isArray(operations)) throw new Error('Invalid patch');
  let updated = copy(snapshot);
  for (const operation of operations) {
    if (!object(operation) || (operation.op !== 'set' && operation.op !== 'delete')
      || !Array.isArray(operation.path) || !operation.path.every(key => typeof key === 'string' && !forbidden.has(key))
      || (operation.op === 'set' && (!Object.hasOwn(operation, 'value') || !safeTree(operation.value)))) throw new Error('Invalid patch operation');
    const path = operation.path as string[];
    if (!path.length) {
      if (operation.op !== 'set' || !object(operation.value)) throw new Error('Invalid root patch');
      updated = copy(operation.value);
      continue;
    }
    let target: Record<string, unknown> = updated;
    for (const key of path.slice(0, -1)) {
      if (!Object.hasOwn(target, key) || !target[key] || typeof target[key] !== 'object') throw new Error('Missing patch parent');
      target = target[key] as Record<string, unknown>;
    }
    const key = path[path.length - 1];
    if (operation.op === 'set') target[key] = copy(operation.value);
    else delete target[key];
  }
  return updated;
}
async function receive(room: Room, value: unknown, generation: number) {
  if (room.generation !== generation) return;
  if (!object(value)) { invalidFrame(room); return; }
  if (value.type === 'relay_ready') return;
  if (value.type === 'challenge') {
    if (room.channel || !room.socket) { invalidFrame(room); return; }
    if (!nonempty(value.nonce) || !integer(value.fence)
      || value.fence < (room.session?.identity.fencingToken ?? Infinity)) { fail(room, generation); return; }
    if (room.nonce) return;
    room.nonce = value.nonce;
    ready(room, generation);
    return;
  }
  if (value.type !== 'state' && value.type !== 'patch' && value.type !== 'host_changed' && value.type !== 'host_grant' && value.type !== 'host_action' && value.type !== 'intent_result') return;
  if (value.room !== room.id) return;
  const active = room.session;
  const signature = decodeSignature(value.signature);
  if (!active || !signature) { invalidFrame(room); return; }
  const unsigned = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'signature'));
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, active.verifier, signature, encoder.encode(JSON.stringify(unsigned)));
  if (room.generation !== generation) return;
  if (!valid) { invalidFrame(room); return; }
  if (!integer(value.fence) || !integer(value.seq) || !Number.isFinite(value.serverNow)
    || value.fence < active.identity.fencingToken || !safeTree(value)
    || (value.players !== undefined && !Array.isArray(value.players))) { protocolError(room); return; }
  if (value.type === 'intent_result') {
    if (value.playerId !== active.identity.playerId || !integer(value.requestSequence) || typeof value.ok !== 'boolean') return;
    const pending = room.acceptances.get(value.requestSequence);
    if (pending) {
      clearTimeout(pending.timer);
      room.acceptances.delete(value.requestSequence);
      pending.resolve(value.ok ? 'ok' : 'error');
    }
    return;
  }
  if (value.type === 'host_changed') {
    if (value.fence <= active.identity.fencingToken || !['shanghai', 'fallback', 'player'].includes(String(value.mode))) return;
    // Only a verified previous authority can request a fresh TLS session.
    stopConnection(room);
    notifyConnection(room, 'connecting');
    void connect(room, true);
    return;
  }
  if (value.type === 'host_grant' || value.type === 'host_action') {
    if (active.identity.mode !== 'player' || active.identity.designatedPlayerId !== active.identity.playerId) return;
    if (value.type === 'host_grant' && value.playerId !== active.identity.playerId) return;
    acceptPlayerHostFrame({
      roomId: room.id, playerId: active.identity.playerId, frame: value as unknown as Parameters<typeof acceptPlayerHostFrame>[0]['frame'],
      sendIntent: body => sendHostIntent(room.id, body),
    });
    return;
  }
  const previous = room.frame;
  if (previous && (value.fence < previous.fence || (value.fence === previous.fence && value.seq <= previous.seq))) return;
  if (value.type === 'state') {
    if (!object(value.snapshot) || !Array.isArray(value.players)) { notifyConnection(room, 'error'); return; }
    room.frame = {
      type: 'state', room: room.id, fence: value.fence, seq: value.seq,
      serverNow: value.serverNow as number, snapshot: copy(value.snapshot), players: copy(value.players),
    };
    room.requireFull = false;
    room.requestingFull = false;
  } else {
    if (!integer(value.baseSeq)) { notifyConnection(room, 'error'); return; }
    if (!previous || room.requireFull || value.fence !== previous.fence || value.baseSeq !== previous.seq) {
      room.requireFull = true; requestFull(room); return;
    }
    try {
      room.frame = {
        ...previous, fence: value.fence, seq: value.seq, serverNow: value.serverNow as number,
        snapshot: applyPatch(previous.snapshot, value.patch),
        players: value.players === undefined ? previous.players : copy(value.players as unknown[]),
      };
    } catch { protocolError(room); room.requireFull = true; requestFull(room); return; }
  }
  notifyConnection(room, 'online');
  notifyFrame(room);
}
function accept(room: Room, value: unknown, generation: number) {
  room.incoming = room.incoming.then(() => receive(room, value, generation)).catch(error => {
    if (generation === room.generation) { console.error('Host frame rejected', error); notifyConnection(room, 'error'); }
  });
}
async function connect(room: Room, refresh = false) {
  if (room.starting) return room.starting;
  room.starting = (async () => {
    if (room.reconnectTimer) clearTimeout(room.reconnectTimer);
    room.reconnectTimer = undefined;
    stopConnection(room);
    const generation = room.generation;
    room.requireFull = true; room.requestingFull = false;
    notifyConnection(room, 'connecting');
    try {
      const active = await session(refresh);
      if (room.generation !== generation) return;
      room.session = active;
      room.handshakeTimer = setTimeout(() => fail(room, generation), 10_000);
      if (active.identity.mode === 'shanghai') {
        const url = new URL('/api/game-ws', location.origin);
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('room', room.id);
        const socket = new WebSocket(url.href);
        room.socket = socket;
        socket.onmessage = event => {
          if (room.generation !== generation) return;
          try { accept(room, JSON.parse(String(event.data)), generation); }
          catch { notifyConnection(room, 'error'); }
        };
        socket.onclose = () => fail(room, generation);
        socket.onerror = () => fail(room, generation);
      } else {
        const { supabase } = await import('./supabase');
        if (room.generation !== generation) return;
        const channel = supabase.channel(`ransen:${room.id}`, { config: { broadcast: { self: false, ack: false } } }) as unknown as Channel;
        room.channel = channel;
        room.nonce = active.identity.nonce;
        channel.on('broadcast', { event: 'host_frame' }, ({ payload }) => accept(room, payload, generation))
          .subscribe(status => {
            if (room.generation !== generation) return;
            if (status === 'SUBSCRIBED') {
              ready(room, generation);
              room.heartbeatTimer = setInterval(() => {
                if (room.generation === generation) void queueBody(room, { type: 'ping' });
              }, 60_000);
            }
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') fail(room, generation);
          });
      }
    } catch (error) {
      const failure = error instanceof HostFailureError ? error.failure : connectionFailure('CONNECTION_LOST', 'connection');
      console.error('Host connection failed', failure.code);
      fail(room, generation, failure);
    }
  })().finally(() => { room.starting = undefined; });
  return room.starting;
}
async function waitReady(room: Room): Promise<boolean> {
  if (rooms.get(room.id) !== room) return false;
  if (room.connection === 'online' && room.nonce) return true;
  if (room.connection === 'error') {
    // Player input must not bypass the bounded retry timer during an outage.
    if (room.reconnectTimer || !visible()) return false;
    await connect(room, true);
  } else if (room.starting) await room.starting;
  else if (!room.socket && !room.channel) await connect(room);
  if (rooms.get(room.id) !== room) return false;
  if (room.connection === 'online' && room.nonce) return true;
  if (room.connection === 'error') return false;
  return new Promise(resolve => room.readyWaiters.push(resolve));
}
function queueBody(room: Room, body: Body): Promise<IntentResult> {
  let resolve!: (result: IntentResult) => void;
  const pending = new Promise<IntentResult>(done => { resolve = done; });
  room.queue = room.queue.then(async () => {
    if (!await waitReady(room)) { resolve('error'); return; }
    const result = await signedSend(room, body);
    // Release the send queue while the authority finishes admission/persistence.
    if (result.accepted) void result.accepted.then(resolve);
    else resolve(result.sent);
  }).catch(error => { console.error('Host intent queue failed', error); resolve('error'); });
  return pending;
}
function getRoom(id: string): Room {
  if (!nonempty(id) || id.length > 120) throw new TypeError('Invalid room');
  let room = rooms.get(id);
  if (!room) {
    room = {
      id, subscribers: new Set(), connection: 'connecting', generation: 0,
      queue: Promise.resolve(), incoming: Promise.resolve(), sequence: 0, invalidFrames: 0, lastInvalidWarningAt: -Infinity,
      requireFull: true, requestingFull: false, retry: 0, readyWaiters: [], acceptances: new Map(), lastInputAt: -Infinity,
    };
    rooms.set(id, room);
  }
  if (!listenersInstalled && typeof window !== 'undefined') {
    listenersInstalled = true;
    const reconnect = () => {
      if (visible()) for (const active of rooms.values()) if (active.subscribers.size) void connect(active, true);
    };
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', reconnect);
  }
  return room;
}
export function subscribeHost(id: string, onFrame: Subscriber['onFrame'], onConnection: Subscriber['onConnection']): () => void {
  const room = getRoom(id);
  const subscriber = { onFrame, onConnection };
  room.subscribers.add(subscriber);
  onConnection(room.connection, room.failure ? copy(room.failure) : undefined);
  if (room.frame) onFrame(copy(room.frame));
  if (!room.socket && !room.channel && !room.reconnectTimer) void connect(room);
  return () => {
    room.subscribers.delete(subscriber);
    if (!room.subscribers.size) {
      if (room.reconnectTimer) clearTimeout(room.reconnectTimer);
      room.reconnectTimer = undefined;
      stopConnection(room);
      rooms.delete(id);
    }
  };
}
/** Retry only a watched room; connection setup already serializes concurrent retries. */
export async function retryHostConnection(id: string): Promise<void> {
  const room = rooms.get(id);
  if (!room?.subscribers.size) return;
  await connect(room, true);
}
export async function sendHostIntent(id: string, body: Body): Promise<IntentResult> {
  if (!object(body) || !safeTree(body)) return 'error';
  const room = getRoom(id);
  let serialized: Body;
  try { serialized = copy(body); } catch { return 'error'; }
  if (body.type !== 'input') return queueBody(room, serialized);
  if (!visible()) return 'error';
  return new Promise(resolve => {
    if (room.pendingInput) {
      room.pendingInput.body = serialized;
      room.pendingInput.waiters.push(resolve);
      return;
    }
    room.pendingInput = { body: serialized, waiters: [resolve] };
    room.queue = room.queue.then(async () => {
      const delay = Math.max(0, 50 - (Date.now() - room.lastInputAt));
      if (delay) await new Promise(done => setTimeout(done, delay));
      const ready = await waitReady(room);
      const latest = room.pendingInput!;
      room.pendingInput = undefined;
      const result = ready && visible() ? (await signedSend(room, latest.body)).sent : 'error';
      room.lastInputAt = Date.now();
      latest.waiters.forEach(done => done(result));
    }).catch(error => {
      console.error('Host input queue failed', error);
      const latest = room.pendingInput;
      room.pendingInput = undefined;
      latest?.waiters.forEach(done => done('error'));
    });
  });
}
