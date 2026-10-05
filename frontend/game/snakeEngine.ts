import { ArenaState, GamePhase, SnakeState } from '../types';
import { generateSingleFood } from './foodGenerator';
import { updateSnakePosition } from './snakeMovement';
import { checkAndResolveCollisions, triggerSelfTailSpill } from './collisionEngine';
import { settleWord as completeWord, settleSentence as completeSentence } from './settleManager';
import { updateBotAI } from './botAI';
import { searchCandidates } from '../language/trieEngine';
import { analyzeSentenceBuilding } from '../language/sentenceEngine';

export interface EngineActionResult {
  ok: boolean;
  code: string;
  changed: boolean;
  events?: ReturnType<typeof checkAndResolveCollisions>['events'];
}

export interface SnakeEngineOptions {
  snapshot: ArenaState;
  now?: () => number;
  random?: () => number;
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Owns the authoritative arena. Transport authentication must supply playerId;
 * request payloads must never supply identities or candidate contents.
 * Existing physics/language helpers retain their own clock/random sources.
 */
export function createSnakeEngine(options: SnakeEngineOptions) {
  let state = clone(options.snapshot);
  const clock = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const buildKeys = new Map<string, string>();

  const refreshBuild = (snake: SnakeState): SnakeState => {
    // Mouth coordinates change every frame; only the language-bearing sequence
    // and theme invalidate candidate search.
    const key = JSON.stringify([state.theme, snake.heldFoods.map(food =>
      [food.foodId, food.glyph, food.normalizedGlyph, food.order])]);
    if (buildKeys.get(snake.id) === key) return snake;
    buildKeys.set(snake.id, key);
    const words = searchCandidates(snake.heldFoods, state.theme);
    const sentences = analyzeSentenceBuilding(snake.heldFoods, state.theme);
    return {
      ...snake,
      buildState: {
        status: sentences.isSentenceReady ? 'SENTENCE_READY'
          : sentences.isSentenceBuilding ? 'SENTENCE_BUILDING' : words.status,
        candidates: words.candidates,
        sentenceCandidates: sentences.candidates,
        version: (snake.buildState.version || 0) + 1,
      },
    };
  };

  // Never accept cached candidates as evidence for a settlement.
  for (const id of Object.keys(state.snakes)) state.snakes[id] = refreshBuild(state.snakes[id]);

  const findPlayer = (playerId: string) => Object.values(state.snakes)
    .find(snake => snake.playerId === playerId && !snake.isBot && snake.connected);
  const result = (ok: boolean, code: string, changed = false, events?: EngineActionResult['events']): EngineActionResult => ({ ok, code, changed, ...(events ? { events } : {}) });
  const canAct = (playerId: string) => state.phase === GamePhase.PLAYING
    && typeof playerId === 'string' && findPlayer(playerId);
  const bump = () => { state.version += 1; };
  const ended = (now: number) => state.startedAt !== null && now >= state.startedAt + 120_000;

  const settle = (playerId: string, candidateIndex: number, sentence: boolean): EngineActionResult => {
    if (ended(clock())) return result(false, 'match_ended');
    const snake = canAct(playerId);
    if (!snake) return result(false, 'player_unavailable');
    if (!Number.isSafeInteger(candidateIndex) || candidateIndex < 0) return result(false, 'invalid_candidate');
    const freshWords = searchCandidates(snake.heldFoods, state.theme);
    const freshSentences = analyzeSentenceBuilding(snake.heldFoods, state.theme);
    const candidate = sentence ? freshSentences.candidates[candidateIndex] : freshWords.candidates[candidateIndex];
    if (!candidate) return result(false, candidateIndex === 0 && !sentence && snake.heldFoods.length >= 2 ? 'requires_validation' : 'invalid_candidate');
    if (!sentence && state.mode === 'random' && !candidate.themeMatch) {
      const spilled = triggerSelfTailSpill(snake.id, state.snakes, state.foods, state.bounds);
      state.snakes = spilled.updatedSnakes;
      state.foods = spilled.updatedFoods;
      state.snakes[snake.id] = refreshBuild(state.snakes[snake.id]);
      bump();
      return result(false, 'theme_mismatch', true, { foodPickups: [], spills: [{ victimId: snake.id, attackerId: null, foodCount: snake.heldFoods.length }] });
    }
    if (!sentence && state.mode === 'disaster') return result(false, 'requires_validation');
    const completed = sentence
      ? completeSentence(snake, freshSentences.candidates[candidateIndex], state.foods, state.bounds, state.theme)
      : completeWord(snake, freshWords.candidates[candidateIndex], state.foods, state.bounds, state.theme);
    state.snakes[snake.id] = refreshBuild(completed.updatedSnake);
    state.foods = completed.updatedFoods;
    bump();
    return result(true, 'settled', true);
  };

  return {
    snapshot: (): ArenaState => clone(state),

    input(playerId: string, input: { targetX: number; targetY: number }): EngineActionResult {
      if (ended(clock())) return result(false, 'match_ended');
      const snake = canAct(playerId);
      if (!snake) return result(false, 'player_unavailable');
      if (!input || typeof input !== 'object'
        || Object.keys(input).some(key => key !== 'targetX' && key !== 'targetY')
        || !Number.isFinite(input.targetX) || !Number.isFinite(input.targetY)) {
        return result(false, 'invalid_input');
      }
      if (snake.target.x === input.targetX && snake.target.y === input.targetY) return result(true, 'unchanged');
      state.snakes[snake.id] = { ...snake, target: { x: input.targetX, y: input.targetY } };
      bump();
      return result(true, 'updated', true);
    },

    spillTail(playerId: string): EngineActionResult {
      if (ended(clock())) return result(false, 'match_ended');
      const snake = canAct(playerId);
      if (!snake) return result(false, 'player_unavailable');
      if (!snake.heldFoods.length) return result(true, 'unchanged');
      const spilled = triggerSelfTailSpill(snake.id, state.snakes, state.foods, state.bounds);
      state.snakes = spilled.updatedSnakes;
      state.foods = spilled.updatedFoods;
      state.snakes[snake.id] = refreshBuild(state.snakes[snake.id]);
      bump();
      return result(true, 'spilled', true, { foodPickups: [], spills: [{ victimId: snake.id, attackerId: null, foodCount: snake.heldFoods.length }] });
    },

    setConnected(playerId: string, connected: boolean): EngineActionResult {
      const snake = Object.values(state.snakes).find(item => item.playerId === playerId && !item.isBot);
      if (!snake || typeof connected !== 'boolean') return result(false, 'player_unavailable');
      if (snake.connected === connected) return result(true, 'unchanged');
      state.snakes[snake.id] = { ...snake, connected };
      bump();
      return result(true, 'updated', true);
    },

    settleWord: (playerId: string, candidateIndex: number) => settle(playerId, candidateIndex, false),
    settleSentence: (playerId: string, candidateIndex: number) => settle(playerId, candidateIndex, true),


    // Trusted server-only continuation of snake-language-validate. Never expose
    // this method through the player protocol or accept validation from a client.
    applyWordValidation(
      playerId: string,
      expectedHeldFoodIds: string[],
      validation: { ok: boolean; valid: boolean; canonical?: string; reason?: string },
      candidateIndex?: number,
    ): EngineActionResult {
      if (ended(clock())) return result(false, 'match_ended');
      const snake = canAct(playerId);
      if (!snake) return result(false, 'player_unavailable');
      if (!Array.isArray(expectedHeldFoodIds) || expectedHeldFoodIds.length !== snake.heldFoods.length
        || expectedHeldFoodIds.some((id, index) => id !== snake.heldFoods[index].foodId)) {
        return result(false, 'stale_validation');
      }
      if (snake.heldFoods.length < 2) return result(false, 'invalid_candidate');
      if (!validation || validation.ok !== true || validation.valid !== true) {
        const spilled = triggerSelfTailSpill(snake.id, state.snakes, state.foods, state.bounds);
        state.snakes = spilled.updatedSnakes;
        state.foods = spilled.updatedFoods;
        state.snakes[snake.id] = refreshBuild(state.snakes[snake.id]);
        bump();
        return result(false, validation?.reason || 'validation_failed', true, { foodPickups: [], spills: [{ victimId: snake.id, attackerId: null, foodCount: snake.heldFoods.length }] });
      }
      const candidate = candidateIndex === undefined ? undefined
        : searchCandidates(snake.heldFoods, state.theme).candidates[candidateIndex];
      if (candidateIndex !== undefined && (!Number.isSafeInteger(candidateIndex) || !candidate
        || validation.canonical !== candidate.canonical)) return result(false, 'validation_mismatch');
      const surface = snake.heldFoods.map(food => food.glyph).join('');
      const canonical = typeof validation.canonical === 'string' && validation.canonical ? validation.canonical : surface;
      const completed = completeWord(snake, {
        id: `verified-${clock()}`, canonical, reading: candidate?.reading ?? canonical,
        readingLength: candidate?.readingLength ?? Array.from(surface).length, themeMatch: true,
        ...(candidate ? { consumedFoodIds: candidate.consumedFoodIds } : {}),
      }, state.foods, state.bounds, state.theme);
      state.snakes[snake.id] = refreshBuild(completed.updatedSnake);
      state.foods = completed.updatedFoods;
      bump();
      return result(true, 'settled', true);
    },

    tick(now = clock(), deltaMs = 0) {
      const events: ReturnType<typeof checkAndResolveCollisions>['events'] = { foodPickups: [], spills: [] };
      if (!Number.isFinite(now) || !Number.isFinite(deltaMs) || deltaMs < 0) throw new TypeError('Invalid tick time');
      if (state.phase !== GamePhase.PLAYING) return { snapshot: clone(state), changed: false, dirty: false, events };
      const before = JSON.stringify(state);
      if (ended(now)) {
        state.phase = GamePhase.THEATER;
        state.endsAt = state.startedAt! + 120_000;
        // Match the Theater screen's earned-length ordering and derive all counts
        // from authoritative completion records.
        state.leaderboard = Object.values(state.snakes).sort((a, b) => b.earnedLength - a.earnedLength)
          .map((snake, index) => ({
            rank: index + 1, playerId: snake.playerId, nickname: snake.nickname,
            color: snake.baseColor, totalLength: snake.totalLength, isBot: snake.isBot,
            wordsCount: snake.completionHistory.filter(record => record.type === 'word').length,
            sentencesCount: snake.completionHistory.filter(record => record.type === 'sentence').length,
          }));
        bump();
        return { snapshot: clone(state), changed: true, dirty: true, endReason: 'timeout' as const, events };
      }

      if (state.startedAt !== null) {
        const elapsed = Math.max(0, Math.floor((now - state.startedAt) / 1000));
        const size = 1000 - elapsed / 240 * 200;
        state.bounds = { minX: -size, maxX: size, minY: -size, maxY: size };
      }
      let foods = { ...state.foods };
      for (const id of Object.keys(foods)) {
        const food = foods[id];
        if (food.state === 'ground' && (food.x < state.bounds.minX || food.x > state.bounds.maxX
          || food.y < state.bounds.minY || food.y > state.bounds.maxY)) foods[id] = generateSingleFood(id, state.bounds);
      }
      const missing = Math.max(1, Object.keys(state.snakes).length) * 12
        - Object.values(foods).filter(food => food.state === 'ground').length;
      for (let index = 0; index < missing; index++) {
        const id = `food-replenish-${now}-${index}-${random().toString(36).substring(2, 6)}`;
        foods[id] = generateSingleFood(id, state.bounds);
      }
      const previous = state.snakes;
      const moved: Record<string, SnakeState> = {};
      const deltaSeconds = Math.min(0.1, deltaMs / 1000);
      for (const id of Object.keys(previous)) {
        let snake = previous[id];
        if (snake.isBot) {
          const decision = updateBotAI(snake, previous, foods, state.bounds, state.theme);
          snake = { ...snake, target: decision.target };
          if (decision.shouldSettleSentenceIndex !== undefined && snake.buildState.sentenceCandidates[0]) {
            const completed = completeSentence(snake, snake.buildState.sentenceCandidates[0], foods, state.bounds, state.theme);
            snake = completed.updatedSnake;
            foods = completed.updatedFoods;
          } else if (decision.shouldSettleWordIndex !== undefined && snake.buildState.candidates[0]) {
            const completed = completeWord(snake, snake.buildState.candidates[0], foods, state.bounds, state.theme);
            snake = completed.updatedSnake;
            foods = completed.updatedFoods;
          }
        }
        moved[id] = refreshBuild(updateSnakePosition(snake, deltaSeconds, state.bounds, previous));
      }
      const collisions = checkAndResolveCollisions(moved, foods, state.bounds);
      state.snakes = collisions.updatedSnakes;
      state.foods = collisions.updatedFoods;
      // Refresh after pickup/spill, so subsequent commands see current held foods.
      for (const id of Object.keys(state.snakes)) state.snakes[id] = refreshBuild(state.snakes[id]);
      const changed = before !== JSON.stringify(state);
      if (changed) bump();
      return { snapshot: clone(state), changed, dirty: changed, events: collisions.events };
    },
  };
}

export type SnakeEngine = ReturnType<typeof createSnakeEngine>;
