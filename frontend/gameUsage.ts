import { UsageMeter, SOURCES, GAMES } from '../room-director/usage-meter.mjs';

export type GameUsageOptions = {
  runId: string; variant: string; game: 'ransen' | 'snake'; collectorId: string; real?: boolean;
};
declare global {
  var __GAME_MEASUREMENT__: GameUsageOptions | undefined;
  var __GAME_USAGE__: { getReport: typeof getGameUsageReport; stop: typeof stopGameUsage } | undefined;
}
const rooms = new Set(['main', 'bousai-toyama', 'snake-free', 'snake-theme', 'snake-disaster']);
type Session = {
  options: GameUsageOptions; meter: any; roomMeters: Map<string, any>; proxyReports: Map<string, any>;
  startedAt: number; stoppedAt?: number; active: boolean; originalFetch: any; originalSocket: any;
  fetchWrapper?: any; socketWrapper?: any; bridge?: NonNullable<typeof globalThis.__GAME_USAGE__>; cleanups: Set<() => void>;
};
let session: Session | undefined;
const now = () => performance.now();
function payloadBytes(data: any): number | null {
  if (typeof data === 'string') return new TextEncoder().encode(data).byteLength;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.size;
  return null;
}
function packetRoom(data: any): string | undefined {
  // Inspect only transient routing fields. Never retain payloads, topics or URLs.
  try {
    const text = typeof data === 'string' ? data
      : data instanceof ArrayBuffer ? new TextDecoder().decode(data)
      : ArrayBuffer.isView(data) ? new TextDecoder().decode(data as ArrayBufferView) : null;
    if (text == null) return;
    const packet = JSON.parse(text);
    const topic = Array.isArray(packet) ? packet[2] : packet?.topic;
    const event = Array.isArray(packet) ? packet[3] : packet?.event;
    if (event === 'heartbeat' || topic === 'phoenix') return;
    if (typeof topic === 'string') {
      const room = topic.split(':').find((part: string) => rooms.has(part));
      if (room) return room;
    }
    const body = Array.isArray(packet) ? packet[4] : packet;
    for (const room of [body?.room, body?.payload?.room, body?.payload?.payload?.room]) {
      if (typeof room === 'string' && rooms.has(room)) return room;
    }
  } catch { /* Opaque/binary frames still count their bytes for this page. */ }
}
const roomGame = (room: string | undefined, pageGame: string) =>
  room === 'main' || room === 'bousai-toyama' ? 'ransen' : room?.startsWith('snake-') ? 'snake' : pageGame;
function recordSocket(current: Session, realtime: boolean, room: string | undefined, direction: 'sent' | 'received', data: any) {
  if (!current.active) return;
  const bytes = payloadBytes(data);
  if (bytes == null) { current.meter.measurementErrors++; return; }
  const game = roomGame(room, current.options.game);
  const context = { source: 'frontend', game, direction, bytes };
  if (realtime) current.meter.recordRealtime(context);
  else current.meter.recordWss(context);
  const key = room || 'unassigned';
  let meter = current.roomMeters.get(key);
  if (!meter) {
    meter = new UsageMeter(current.options);
    current.roomMeters.set(key, meter);
  }
  if (realtime) meter.recordRealtime(context);
  else meter.recordWss(context);
}


const proxyTransports = new Set(['http', 'fetch', 'websocket', 'realtime', 'unknown', 'operation', 'host-http-upstream', 'ws-client', 'ws-upstream']);
const proxyMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']);
function proxyNumber(value: any): number {
  if (!Number.isFinite(value) || value < 0) throw new TypeError('invalid proxy counter');
  return value;
}
function proxyBucket(value: any): any {
  const methods: Record<string, any> = {};
  if (!value || !value.http || !value.http.methods || !value.transports) throw new TypeError('invalid proxy bucket');
  for (const [method, counters] of Object.entries(value.http.methods)) {
    if (!proxyMethods.has(method)) throw new TypeError('invalid proxy method');
    methods[method] = Object.fromEntries(['requests', 'responses', 'requestBytes', 'responseBytes', 'errors',
      'unmeasuredRequestBodies', 'unmeasuredResponses'].map(key => [key, proxyNumber((counters as any)?.[key])]));
  }
  const transports: Record<string, number> = {};
  for (const [transport, count] of Object.entries(value.transports)) {
    if (!proxyTransports.has(transport)) throw new TypeError('invalid proxy transport');
    transports[transport] = proxyNumber(count);
  }
  return { http: { methods }, realtime: Object.fromEntries(['sent', 'received'].map(direction => [direction, {
    messages: proxyNumber(value.realtime?.[direction]?.messages), bytes: proxyNumber(value.realtime?.[direction]?.bytes),
  }])), wss: { sentBytes: proxyNumber(value.wss?.sentBytes), receivedBytes: proxyNumber(value.wss?.receivedBytes) },
    periodicWrites: proxyNumber(value.periodicWrites), periodicStateBroadcasts: proxyNumber(value.periodicStateBroadcasts), transports };
}
function consumeProxyUsage(current: Session, response: Response): void {
  if (!current.active) return;
  try {
    const raw = response.headers?.get?.('x-game-proxy-usage');
    if (raw == null) return; // Ordinary requests need not carry proxy measurements.
    const report = JSON.parse(raw);
    if (report?.runId !== current.options.runId || report?.variant !== current.options.variant ||
        report.byteScope !== 'payload' || typeof report.real !== 'boolean' ||
        !Array.isArray(report.collectorIds) || report.collectorIds.length !== 1 ||
        typeof report.collectorIds[0] !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(report.collectorIds[0]) ||
        !Number.isSafeInteger(report.sequence) || report.sequence < 1 ||
        !Array.isArray(report.coverage)) throw new TypeError('invalid proxy report');
    const bySourceGame = Object.fromEntries(SOURCES.map(source => [source,
      Object.fromEntries(GAMES.map(game => [game, proxyBucket(report.bySourceGame?.[source]?.[game])]))]));
    const byGame = Object.fromEntries(GAMES.map(game => [game, proxyBucket(report.byGame?.[game])]));
    const coverage = report.coverage.map((value: any) => {
      if (typeof value !== 'string' || !SOURCES.some(source => GAMES.some(game => value === source + '/' + game)))
        throw new TypeError('invalid proxy coverage');
      return value;
    });
    // Whitelist aggregate fields; never retain arbitrary header properties or raw JSON.
    const clean = { runId: current.options.runId, variant: current.options.variant,
      collectorIds: [report.collectorIds[0]], sequence: report.sequence, durationMs: proxyNumber(report.durationMs),
      real: report.real, byteScope: 'payload', bySourceGame, byGame, total: proxyBucket(report.total),
      coverage: [...new Set(coverage)].sort(), measurementErrors: proxyNumber(report.measurementErrors) };
    const previous = current.proxyReports.get(clean.collectorIds[0]);
    if (!previous || clean.sequence > previous.sequence) current.proxyReports.set(clean.collectorIds[0], clean);
  } catch { current.meter.measurementErrors++; }
}

/** Opt-in counters only. Installing without a valid configuration changes nothing. */
export function installGameUsage(options?: GameUsageOptions): boolean {
  if (!options || !['ransen', 'snake'].includes(options.game) ||
      (options.real !== undefined && typeof options.real !== 'boolean')) return false;
  let meter: any;
  const config = { runId: options.runId, variant: options.variant, collectorId: options.collectorId,
    game: options.game, real: options.real ?? true };
  try { meter = new UsageMeter(config); } catch { return false; }
  if (session?.active) return false;
  const current: Session = {
    options: config, meter, roomMeters: new Map(), proxyReports: new Map(), startedAt: now(), active: true,
    originalFetch: globalThis.fetch, originalSocket: globalThis.WebSocket, cleanups: new Set(),
  };
  session = current;
  if (typeof current.originalFetch === 'function') {
    const measuredFetch = meter.wrapFetch(current.originalFetch.bind(globalThis), { source: 'frontend', game: config.game });
    current.fetchWrapper = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!current.active) return current.originalFetch.call(globalThis, input, init);
      const response = await measuredFetch(input, init);
      consumeProxyUsage(current, response);
      return response;
    };
    globalThis.fetch = current.fetchWrapper;
  }
  if (typeof current.originalSocket === 'function') {
    const Original = current.originalSocket;
    current.socketWrapper = new Proxy(Original, {
      construct(target, args, newTarget) {
        if (!current.active) return Reflect.construct(target, args, newTarget === current.socketWrapper ? target : newTarget) as WebSocket;
        const socket = Reflect.construct(target, args, newTarget === current.socketWrapper ? target : newTarget) as WebSocket;
        let realtime = false, room: string | undefined;
        try {
          const url = new URL(String(args[0]), globalThis.location?.href || 'https://measurement.invalid');
          realtime = url.pathname.includes('/realtime/v1/websocket');
          const requestedRoom = url.searchParams.get('room');
          if (requestedRoom && rooms.has(requestedRoom)) room = requestedRoom;
        } catch { /* Native construction already validates its own URL. */ }
        const send = socket.send;
        const ownDescriptor = Object.getOwnPropertyDescriptor(socket, 'send');
        const wrappedSend = function(this: any, data: any) {
          const result = send.call(this, data);
          recordSocket(current, realtime, realtime ? packetRoom(data) : room, 'sent', data);
          return result;
        };
        socket.send = wrappedSend;
        const onMessage = (event: MessageEvent) =>
          recordSocket(current, realtime, realtime ? packetRoom(event.data) : room, 'received', event.data);
        socket.addEventListener('message', onMessage);
        const cleanup = () => {
          socket.removeEventListener('message', onMessage);
          socket.removeEventListener('close', onClose);
          if (socket.send === wrappedSend) {
            if (ownDescriptor) Object.defineProperty(socket, 'send', ownDescriptor);
            else delete socket.send;
          }
          current.cleanups.delete(cleanup);
        };
        const onClose = () => cleanup();
        socket.addEventListener('close', onClose);
        current.cleanups.add(cleanup);
        return socket;
      },
    });
    globalThis.WebSocket = current.socketWrapper;
  }
  if (globalThis.__GAME_USAGE__ === undefined) {
    current.bridge = Object.freeze({ getReport: getGameUsageReport, stop: stopGameUsage });
    globalThis.__GAME_USAGE__ = current.bridge;
  }
  return true;
}

export async function getGameUsageReport() {
  const current = session;
  if (!current) return null;
  const report = await current.meter.report();
  report.durationMs = Math.max(0, (current.stoppedAt ?? now()) - current.startedAt);
  const roomBreakdown: Record<string, any> = {};
  for (const [room, meter] of current.roomMeters) roomBreakdown[room] = (await meter.report()).total;
  return { ...report, pageGame: current.options.game, pageTotal: report.total, roomBreakdown,
    proxyReports: [...current.proxyReports.values()].sort((a, b) => a.collectorIds[0].localeCompare(b.collectorIds[0]))
      .map(report => JSON.parse(JSON.stringify(report))),
    proxyAggregationScope: 'external-complete-window-aggregation-required',
    observationScope: 'fetch-and-websocket-after-install', periodicOperationClassification: 'unclassified' };
}

export function stopGameUsage(): void {
  const current = session;
  if (!current?.active) return;
  current.active = false;
  current.stoppedAt = now();
  if (globalThis.fetch === current.fetchWrapper) globalThis.fetch = current.originalFetch;
  if (globalThis.WebSocket === current.socketWrapper) globalThis.WebSocket = current.originalSocket;
  for (const cleanup of [...current.cleanups]) cleanup();
  if (current.bridge && globalThis.__GAME_USAGE__ === current.bridge) delete globalThis.__GAME_USAGE__;
}
