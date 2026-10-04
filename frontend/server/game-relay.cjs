const http = require('node:http');
const { WebSocket, WebSocketServer } = require('ws');

const ROOMS = new Set(['main', 'bousai-toyama', 'snake-free', 'snake-theme', 'snake-disaster']);
const INPUT_LIMIT = 64 * 1024;
const BUFFER_LIMIT = 1024 * 1024;

function createGameRelay({ upstreamUrl, relayKey, ca, previewProbe = false, buildSha = null, allowLocalUpstream = false, meter } = {}) {
  let target = null;
  if (upstreamUrl) {
    target = new URL(upstreamUrl);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
    if (target.protocol !== 'wss:' && !(allowLocalUpstream && loopback && target.protocol === 'ws:')) {
      throw new Error('Game upstream must use WSS');
    }
    if (target.username || target.password || target.hash) throw new Error('Invalid game upstream');
  }
  const server = http.createServer((req, res) => {
    res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: false, code: 'WEBSOCKET_REQUIRED' }));
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: INPUT_LIMIT, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'https://' + req.headers.host); } catch { socket.destroy(); return; }
    if (url.pathname !== '/api/game-ws') { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { socket.destroy(); return; }
      const canonical = ['https://g.kazeabc.com', 'https://h.kazeabc.com'].includes(origin.origin);
      const sameHost = origin.host === req.headers.host;
      if (!canonical && !sameHost) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    }
    const probe = previewProbe && url.searchParams.get('probe') === '1';
    const room = url.searchParams.get('room') || 'main';
    if (!ROOMS.has(room)) { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    if (!probe && (!target || !relayKey)) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nRetry-After: 30\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(req, socket, head, client => {
      const game = room.startsWith('snake-') ? 'snake' : 'ransen';
      const record = (direction, transport, bytes) => meter?.recordWss?.({
        source: 'relay', game, direction, transport, bytes,
      });
      const send = (peer, data, options, transport, onError) => {
        const bytes = Buffer.byteLength(data);
        peer.send(data, options, error => {
          if (error) { onError?.(); return; }
          record('sent', transport, bytes);
        });
      };
      if (probe) {
        send(client, JSON.stringify({ type: 'probe_ready', buildSha }), {}, 'ws-client', () => client.terminate());
        client.on('message', (data, binary) => {
          record('received', 'ws-client', Buffer.byteLength(data));
          send(client, data, { binary }, 'ws-client', () => client.terminate());
        });
        client.on('error', () => client.terminate());
        return;
      }
      const upstream = new WebSocket(target, {
        headers: { 'x-game-relay-key': relayKey, 'x-game-room': room },
        ...(ca ? { ca } : {}),
        handshakeTimeout: 5000, maxPayload: BUFFER_LIMIT, perMessageDeflate: false
      });
      // Clients wait for relay_ready before sending. No unbounded handshake queue.
      const fail = () => {
        if (client.readyState === WebSocket.OPEN) client.close(1013, 'Host unavailable; reconnect');
        if (upstream.readyState === WebSocket.OPEN) upstream.close();
        else if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
      };
      upstream.on('open', () => {
        if (client.readyState !== WebSocket.OPEN) { upstream.close(); return; }
        send(client, JSON.stringify({ type: 'relay_ready', room }), {}, 'ws-client', fail);
      });
      client.on('message', (data, binary) => {
        record('received', 'ws-client', Buffer.byteLength(data));
        if (upstream.readyState !== WebSocket.OPEN || upstream.bufferedAmount > BUFFER_LIMIT) { fail(); return; }
        send(upstream, data, { binary }, 'ws-upstream', fail);
      });
      upstream.on('message', (data, binary) => {
        record('received', 'ws-upstream', Buffer.byteLength(data));
        if (client.readyState !== WebSocket.OPEN || client.bufferedAmount > BUFFER_LIMIT) { fail(); return; }
        send(client, data, { binary }, 'ws-client', fail);
      });
      client.on('close', () => {
        if(meter?.proxyReport)void meter.proxyReport().then(report=>console.info(JSON.stringify({gameUsage:report}))).catch(()=>console.error('Game usage report failed'));
        if (upstream.readyState === WebSocket.OPEN) upstream.close();
        else if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
      });
      upstream.on('close', () => {
        if (client.readyState === WebSocket.OPEN) client.close(1013, 'Host disconnected; reconnect');
      });
      client.on('error', fail);
      upstream.on('error', fail);
    });
  });
  return server;
}

module.exports = { createGameRelay };
