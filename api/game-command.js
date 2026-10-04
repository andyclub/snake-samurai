const gateway = require('../frontend/server/game-http.cjs');
module.exports = gateway.createGameHttp({ ...gateway.fromEnv(), defaultGame: 'snake' });
