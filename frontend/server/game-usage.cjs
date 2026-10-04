const { randomUUID } = require('node:crypto');
function createProxyMeter() {
  if (!process.env.GAME_MEASURE_RUN_ID) return undefined;
  const { UsageMeter } = require('../../room-director/usage-meter.mjs');
  const meter = new UsageMeter({
    runId: process.env.GAME_MEASURE_RUN_ID,
    variant: process.env.GAME_MEASURE_VARIANT || 'candidate',
    collectorId: 'relay-' + randomUUID(),
    real: true,
  });
  const started = Date.now();
  let sequence = 0;
  meter.proxyReport = async () => {
    meter.durationMs = Date.now() - started;
    return { ...(await meter.report()), sequence: ++sequence };
  };
  return meter;
}
module.exports = { createProxyMeter };
