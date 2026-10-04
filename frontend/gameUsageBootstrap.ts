import { installGameUsage } from './gameUsage';

// Evaluate before SDK/App imports can capture the native transports.
if (globalThis.__GAME_MEASUREMENT__?.game === 'snake') {
  installGameUsage(globalThis.__GAME_MEASUREMENT__);
}
