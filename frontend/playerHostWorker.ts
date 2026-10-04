/// <reference lib="webworker" />
import { createSnakeEngine } from './game/snakeEngine';
import { generateInitialFoods } from './game/foodGenerator';

type Init = {
  type: 'init'; roomId: string; playerId: string; fence: number;
  serverNow: number; snapshot: any; questions: any[];
};

const ALLOWED_ROOMS = new Set(['snake-free', 'snake-theme', 'snake-disaster']);
let engine: ReturnType<typeof createSnakeEngine> | undefined;
let serverNow = 0;
let startedAt = 0;
let currentFence = 0;
let lastPhysicsAt = 0;
let lastPublishAt = 0;
let pendingChanged = false;
let timer: ReturnType<typeof setInterval>;

const clock = () => serverNow + (performance.now() - startedAt);

function applyAction(playerId: string, action: any) {
  if (!engine || !action || typeof action !== 'object') return false;
  switch (action.type) {
    case 'input':
      return engine.input(playerId, { targetX: action.targetX, targetY: action.targetY });
    case 'settle_word':
      return engine.settleWord(playerId, action.candidateIndex);
    case 'settle_sentence':
      return engine.settleSentence(playerId, action.candidateIndex);
    case 'compose': {
      const sentence = engine.settleSentence(playerId, 0);
      return sentence.ok ? sentence : engine.settleWord(playerId, 0);
    }
    case 'spill_tail':
      return engine.spillTail(playerId);
    case 'connected':
      return engine.setConnected(playerId, action.connected);
    case 'trusted_word_validation':
      return engine.applyWordValidation(playerId, action.heldFoodIds, action.result);
    default:
      return { ok: false, code: 'unsupported_action' };
  }
}

self.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'init') {
    const grant = message as Init;
    if (!ALLOWED_ROOMS.has(grant.roomId) || !grant.snapshot || grant.snapshot.phase !== 'PLAYING'
      || !Number.isSafeInteger(grant.fence) || grant.fence <= 0
      || typeof grant.serverNow !== 'number' || !Number.isFinite(grant.serverNow)
      || grant.snapshot.matchId == null || !grant.snapshot.snakes || !grant.snapshot.bounds
      || !Array.isArray(grant.questions)) return;
    clearInterval(timer);
    currentFence = grant.fence;
    serverNow = grant.serverNow;
    startedAt = performance.now();
    lastPhysicsAt = startedAt;
    lastPublishAt = startedAt;
    pendingChanged = false;

    const snapshot = structuredClone(grant.snapshot);
    if (!Object.keys(snapshot.foods || {}).length) {
      pendingChanged = true;
      snapshot.foods = generateInitialFoods(
        Object.keys(snapshot.snakes).length,
        snapshot.bounds,
        undefined,
        snapshot.theme,
      );
    }
    // Preserve the original match start timestamp; only engine time receives
    // the signed server clock plus monotonic elapsed worker time.
    engine = createSnakeEngine({ snapshot, now: clock });
    postMessage({ type: 'ready', fence: grant.fence, matchId: grant.snapshot.matchId });
    timer = setInterval(tick, 1000 / 60);
    return;
  }
  if (!engine || message.fence !== currentFence) return;
  if (message.type === 'action') {
    const result = applyAction(message.playerId, message.action);
    const changed = typeof result === 'boolean' ? result : Boolean(result && (result as { changed?: boolean }).changed);
    const actionType = message.action?.type;
    if (actionType === 'input') pendingChanged ||= changed;
    else if (changed) { pendingChanged = false; lastPublishAt = performance.now(); }
    postMessage({
      type: 'action_result',
      fence: currentFence,
      playerId: message.playerId,
      result,
      actionType,
      changed,
      snapshot: engine.snapshot(),
    });
  }
};

function tick() {
  if (!engine) return;
  const current = performance.now();
  const deltaMs = Math.min(100, Math.max(0, current - lastPhysicsAt));
  lastPhysicsAt = current;
  const result = engine.tick(clock(), deltaMs);
  pendingChanged ||= result.changed;
  if ((pendingChanged && current - lastPublishAt >= 150) || result.endReason) {
    postMessage({ type: 'snapshot', fence: currentFence, snapshot: result.snapshot,
      changed: pendingChanged, endReason: result.endReason });
    lastPublishAt = current;
    pendingChanged = false;
    if (result.endReason) clearInterval(timer);
  }
}
