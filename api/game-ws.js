const usage = require('../frontend/server/game-usage.cjs');
const fs = require('node:fs');
const relay = require('../frontend/server/game-relay.cjs');

// The host owns all battle state; this gateway only relays the connection.
module.exports = relay.createGameRelay({
  meter: usage.createProxyMeter(),
  upstreamUrl: process.env.GAME_HOST_WS_URL,
  relayKey: process.env.GAME_RELAY_KEY,
  ca: process.env.GAME_HOST_CA_FILE
    ? fs.readFileSync(process.env.GAME_HOST_CA_FILE)
    : (process.env.GAME_HOST_CA_PEM || (process.env.GAME_HOST_CA_PATH
      ? fs.readFileSync(process.env.GAME_HOST_CA_PATH) : process.env.GAME_HOST_CA)),
  previewProbe: process.env.VERCEL_ENV === 'preview',
  buildSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
});
