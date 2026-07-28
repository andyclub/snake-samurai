import React, { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Player, Slime, Encounter } from '../types';
import { MOCK_QUESTIONS } from '../mockData';
import TriviaModal from './TriviaModal';
import { audio } from '../audio';
import SlimeAvatar from './SlimeAvatar';
import FullscreenCountdown from './FullscreenCountdown';

interface Props {
  t: (key: string) => string;
  player: Player;
  isSpectator: boolean;
  slimes: Slime[];
  setSlimes: React.Dispatch<React.SetStateAction<Slime[]>>;
  slimesRef: React.MutableRefObject<Slime[]>;
  encounters: Encounter[];
  setEncounters: React.Dispatch<React.SetStateAction<Encounter[]>>;
  encountersRef: React.MutableRefObject<Encounter[]>;
  onGameOver: (reason: 'timeout' | 'last_slime') => void;
  isHost: boolean;
  onMove: (x: number, y: number) => void;
  onVote: (encounterId: string, option: number) => void;
  startedAt: number;
  questionLevels?: string[];
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface BattleEffect {
  id: string;
  x: number;
  y: number;
  color: string;
  colors: string[];
  outcome: 'split' | 'devour';
  playerResult?: 'win' | 'lose';
}

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const TICK_RATE = 50; // ms per tick
const BASE_SPEED = 5;
const BASE_SLIME_SIZE = 30;
const MIN_ZONE_SIZE = .2;
const mapScaleForSlime = (size: number) =>
  Math.max(.1, Math.min(2, BASE_SLIME_SIZE / Math.max(1, size)));

const zoneSizeAt = (elapsedSeconds: number) =>
  Math.max(MIN_ZONE_SIZE, 1 - (Math.min(300, Math.max(0, elapsedSeconds)) / 300) * (1 - MIN_ZONE_SIZE));

const GameBoard: React.FC<Props> = ({ t, player, isSpectator, slimes, setSlimes, slimesRef, encounters, setEncounters, encountersRef, onGameOver, isHost, onMove, onVote, startedAt, questionLevels }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [cameraPos, setCameraPos] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoneSize, setZoneSize] = useState(1); // 1 to 0.2
  const [remainingTime, setRemainingTime] = useState(() => Math.max(0, Math.ceil((startedAt + 300_000 - Date.now()) / 1000)));
  const [battleEffects, setBattleEffects] = useState<BattleEffect[]>([]);
  const boundarySoundAt = useRef(0);
  const usedQuestionTextsRef = useRef(new Set<string>());
  const resolvingRef = useRef(new Set<string>());
  const endedRef = useRef(false);
  const shownEffectsRef = useRef(new Set<string>());
  const lastTouchInputAt = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateViewport = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setViewport({ width: rect.width, height: rect.height });
    };
    const observer = new ResizeObserver(updateViewport);
    observer.observe(containerRef.current);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    updateViewport();
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
    };
  }, []);

  useEffect(() => {
    audio.setBGM(encounters.some(encounter => !encounter.resolved) ? 'BATTLE' : 'EXPLORE');
  }, [encounters]);

  // Refs for mutable state accessed in game loop to avoid dependency cycles
  const zoneSizeRef = useRef(zoneSize);

  useEffect(() => {
    zoneSizeRef.current = zoneSize;
  }, [zoneSize]);

  // --- Game Loop ---
  useEffect(() => {
    let lastTime = performance.now();
    let animationFrameId: number;

    const loop = (time: number) => {
      const deltaTime = time - lastTime;
      
      if (deltaTime >= TICK_RATE) {
        lastTime = time;
        
        if (isHost) updateGameLogic();
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  // --- Absolute five-minute deadline & deterministic zone shrink ---
  useEffect(() => {
    endedRef.current = false;
    const deadline = startedAt + 300_000;
    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setRemainingTime(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      setZoneSize(zoneSizeAt(elapsed));
      if (Date.now() >= deadline && !endedRef.current) {
        endedRef.current = true;
        onGameOver('timeout');
      }
    };
    const timer = setInterval(tick, 200);
    tick();
    return () => clearInterval(timer);
  }, [onGameOver, startedAt]);

  const updateGameLogic = useCallback(() => {
    let currentSlimes = [...slimesRef.current];
    const currentZoneSize = zoneSizeRef.current;
    const activeEncounterIds = new Set(
      encountersRef.current.filter(encounter => !encounter.resolved).flatMap(encounter => [encounter.slime1Id, encounter.slime2Id])
    );
    
    // Calculate current boundaries
    const currentZoneWidth = MAP_WIDTH * currentZoneSize;
    const currentZoneHeight = MAP_HEIGHT * currentZoneSize;
    const minX = MAP_WIDTH / 2 - currentZoneWidth / 2;
    const maxX = MAP_WIDTH / 2 + currentZoneWidth / 2;
    const minY = MAP_HEIGHT / 2 - currentZoneHeight / 2;
    const maxY = MAP_HEIGHT / 2 + currentZoneHeight / 2;
    
    // 1. Move Slimes
    currentSlimes = currentSlimes.map(slime => {
      if (slime.isDead) return slime;
      // A battle locks both slimes in place. This must happen before bot target
      // selection so an all-bot team cannot continue wandering during trivia.
      if (activeEncounterIds.has(slime.id)) return slime;

      // Bot logic: randomly change target
      if (slime.members.every(m => m.isBot) && Math.random() < 0.02) {
        slime.targetX = Math.max(minX, Math.min(maxX, slime.x + (Math.random() - 0.5) * 500));
        slime.targetY = Math.max(minY, Math.min(maxY, slime.y + (Math.random() - 0.5) * 500));
      }

      let nextX = slime.x;
      let nextY = slime.y;
      let moveX = 0;
      let moveY = 0;
      let speedMultiplier = 0;
      const humans = slime.members.filter(member => !member.isBot);
      const bots = slime.members.filter(member => member.isBot);
      const memberTargets = { ...(slime.memberTargets || {}) };

      if (humans.length > 0) {
        const vectors = humans.flatMap(member => {
          const target = memberTargets[member.id];
          if (!target) return [];
          const dx = target.x - slime.x;
          const dy = target.y - slime.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= 5) {
            delete memberTargets[member.id];
            return [];
          }
          return [{ x: dx / distance, y: dy / distance }];
        });
        const sumX = vectors.reduce((sum, vector) => sum + vector.x, 0);
        const sumY = vectors.reduce((sum, vector) => sum + vector.y, 0);
        const magnitude = Math.hypot(sumX, sumY);
        if (magnitude > .05) {
          moveX = sumX / magnitude;
          moveY = sumY / magnitude;
          const agreeingHumans = vectors.filter(vector => vector.x * moveX + vector.y * moveY > 0).length;
          // Human direction votes determine the heading and agreeing votes set
          // the multiplier. Bots never vote; they only add raw acceleration.
          speedMultiplier = agreeingHumans + bots.length;
        }
      } else if (bots.length > 0) {
        const dx = slime.targetX - slime.x;
        const dy = slime.targetY - slime.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 5) {
          moveX = dx / distance;
          moveY = dy / distance;
          speedMultiplier = bots.length;
        }
      }

      if (speedMultiplier > 0) {
        nextX += moveX * BASE_SPEED * speedMultiplier;
        nextY += moveY * BASE_SPEED * speedMultiplier;
      }

      // Boundary Enforcement (Force slime to stay inside the shrinking zone)
      const boundedX = Math.max(minX + slime.size, Math.min(maxX - slime.size, nextX));
      const boundedY = Math.max(minY + slime.size, Math.min(maxY - slime.size, nextY));
      if ((boundedX !== nextX || boundedY !== nextY) && Date.now() - boundarySoundAt.current > 700) {
        boundarySoundAt.current = Date.now(); audio.playDenied();
      }
      nextX = boundedX; nextY = boundedY;
        
      return {
        ...slime,
        x: nextX,
        y: nextY,
        targetX: speedMultiplier > 0 ? nextX + moveX * 200 : humans.length > 0 ? nextX : slime.targetX,
        targetY: speedMultiplier > 0 ? nextY + moveY * 200 : humans.length > 0 ? nextY : slime.targetY,
        memberTargets,
      };
    });

    // 2. Check Collisions
    const engaged = new Set(encountersRef.current.flatMap(e => [e.slime1Id, e.slime2Id]));
    const newEncounters: Encounter[] = [];
    for (let i = 0; i < currentSlimes.length; i++) {
      for (let j = i + 1; j < currentSlimes.length; j++) {
        const s1 = currentSlimes[i];
        const s2 = currentSlimes[j];
        if (s1.isDead || s2.isDead || (s1.invulnerableUntil || 0) > Date.now() || (s2.invulnerableUntil || 0) > Date.now() || engaged.has(s1.id) || engaged.has(s2.id)) continue;

        const dist = Math.hypot(s2.x - s1.x, s2.y - s1.y);
        if (dist < s1.size + s2.size) {
          // Collision detected!
          const availableQuestions = MOCK_QUESTIONS.filter(question =>
            !usedQuestionTextsRef.current.has(question.text)
            && (!questionLevels?.length || (question.level && questionLevels.includes(question.level)))
          );
          if (availableQuestions.length === 0) continue;
          const q = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
          usedQuestionTextsRef.current.add(q.text);
          const botVote = (iq = 100) => {
            const correctChance = Math.min(.92, Math.max(.25, .25 + ((iq - 55) / 110) * .67));
            if (Math.random() < correctChance) return q.correctIndex;
            const wrong = q.options.map((_, index) => index).filter(index => index !== q.correctIndex);
            return wrong[Math.floor(Math.random() * wrong.length)];
          };
          const votes1 = Object.fromEntries(s1.members.filter(member => member.isBot).map(member => [member.id, botVote(member.iq)]));
          const votes2 = Object.fromEntries(s2.members.filter(member => member.isBot).map(member => [member.id, botVote(member.iq)]));
          const botSubmittedAt = Date.now();
          const newEncounter: Encounter = {
            id: `enc-${Date.now()}-${i}-${j}`,
            slime1Id: s1.id,
            slime2Id: s2.id,
            question: q,
            startTime: Date.now(),
            votes1,
            votes2,
            voteTimes1: Object.fromEntries(Object.keys(votes1).map(id => [id, botSubmittedAt])),
            voteTimes2: Object.fromEntries(Object.keys(votes2).map(id => [id, botSubmittedAt])),
            participants1: s1.members.map(member => ({ ...member })),
            participants2: s2.members.map(member => ({ ...member })),
            resolved: false
          };
          newEncounters.push(newEncounter); engaged.add(s1.id); engaged.add(s2.id);
          audio.playAlert();
          break;
        }
      }
    }

    if (newEncounters.length) setEncounters(prev => [...prev, ...newEncounters]);

    // 3. Check Win Condition
    const aliveSlimes = currentSlimes.filter(s => !s.isDead);
    if (aliveSlimes.length <= 1 && currentSlimes.length > 1 && encountersRef.current.length === 0) {
      onGameOver('last_slime');
    }

    setSlimes(currentSlimes);
  }, [onGameOver, setEncounters, setSlimes]);

  // --- Encounter Resolution ---
  const resolveEncounter = useCallback((enc: Encounter) => {
    if (resolvingRef.current.has(enc.id)) return;
    const latestEncounter = encountersRef.current.find(item => item.id === enc.id);
    if (!latestEncounter || latestEncounter.resolved) return;
    const liveSlime1 = slimesRef.current.find(slime => slime.id === enc.slime1Id && !slime.isDead);
    const liveSlime2 = slimesRef.current.find(slime => slime.id === enc.slime2Id && !slime.isDead);
    if (!liveSlime1 || !liveSlime2) {
      setEncounters(previous => previous.filter(item => item.id !== enc.id));
      return;
    }
    resolvingRef.current.add(enc.id);
    setSlimes(prevSlimes => {
      const s1Index = prevSlimes.findIndex(s => s.id === enc.slime1Id);
      const s2Index = prevSlimes.findIndex(s => s.id === enc.slime2Id);
      if (s1Index === -1 || s2Index === -1) {
        resolvingRef.current.delete(enc.id);
        setEncounters(previous => previous.filter(item => item.id !== enc.id));
        return prevSlimes;
      }

      const s1 = prevSlimes[s1Index];
      const s2 = prevSlimes[s2Index];
      
      // Bot intelligence influences decision quality without making outcomes certain.
      const teamIQ = (slime: Slime) => {
        const values = slime.members.filter(m => m.isBot).map(m => m.iq || 100);
        return values.length ? values.reduce((sum, iq) => sum + iq, 0) / values.length : 100;
      };
      const majorityChoice = (votes: Record<string, number>) => {
        const counts = [0, 0, 0, 0];
        Object.values(votes).forEach(vote => { if (vote >= 0 && vote < 4) counts[vote]++; });
        const max = Math.max(...counts);
        return max === 0 ? -1 : counts.indexOf(max);
      };
      const answer1 = majorityChoice(latestEncounter.votes1);
      const answer2 = majorityChoice(latestEncounter.votes2);
      const correct1 = answer1 === latestEncounter.question.correctIndex;
      const correct2 = answer2 === latestEncounter.question.correctIndex;
      const completedAt = (members: Player[], times: Record<string, number> | undefined) =>
        Math.max(...members.map(member => times?.[member.id] || latestEncounter.startTime + 20_000));
      const completed1 = completedAt(s1.members, latestEncounter.voteTimes1);
      const completed2 = completedAt(s2.members, latestEncounter.voteTimes2);
      const s1Score = teamIQ(s1) + s1.size * .35 + Math.random() * 25;
      const s2Score = teamIQ(s2) + s2.size * .35 + Math.random() * 25;
      const s1Wins = correct1 !== correct2 ? correct1 : correct1 && correct2 && completed1 !== completed2 ? completed1 < completed2 : s1Score >= s2Score;
      const winnerIndex = s1Wins ? s1Index : s2Index;
      const loserIndex = s1Wins ? s2Index : s1Index;
      const rawLoser = s1Wins ? s2 : s1;
      const outcome: 'split' | 'devour' = rawLoser.members.length > 1 ? 'split' : 'devour';
      const addBattleStats = (slime: Slime, votes: Record<string, number>, won: boolean): Slime => ({
        ...slime,
        members: slime.members.map(member => {
          const previous = member.battleStats || { battles: 0, votes: 0, correctVotes: 0, wins: 0, losses: 0, devours: 0, splits: 0 };
          const vote = votes[member.id];
          return {
            ...member,
            battleStats: {
              battles: previous.battles + 1,
              votes: previous.votes + (vote === undefined ? 0 : 1),
              correctVotes: previous.correctVotes + (vote === latestEncounter.question.correctIndex ? 1 : 0),
              wins: previous.wins + (won ? 1 : 0),
              losses: previous.losses + (won ? 0 : 1),
              devours: previous.devours + (won && outcome === 'devour' ? 1 : 0),
              splits: previous.splits + (!won && outcome === 'split' ? 1 : 0),
            },
          };
        }),
      });
      const scoredS1 = addBattleStats(s1, latestEncounter.votes1, s1Wins);
      const scoredS2 = addBattleStats(s2, latestEncounter.votes2, !s1Wins);
      const winner = s1Wins ? scoredS1 : scoredS2;
      const loser = s1Wins ? scoredS2 : scoredS1;

      setEncounters(prev => prev.map(item => item.id === enc.id ? {
        ...item,
        resolved: true,
        result: {
          winnerSlimeId: winner.id,
          winnerName: winner.members[0]?.name || 'Slime',
          loserSlimeId: loser.id,
          loserName: loser.members[0]?.name || 'Slime',
          correctIndex: latestEncounter.question.correctIndex,
          outcome,
          leadMs: correct1 && correct2 ? Math.abs(completed1 - completed2) : undefined,
          resolvedAt: Date.now(),
        }
      } : item));
      
      const newSlimes = [...prevSlimes];

      if (outcome === 'split') {
        const splitAt = Math.floor(loser.members.length / 2);
        const firstMembers = loser.members.slice(0, splitAt);
        const secondMembers = loser.members.slice(splitAt);
        const dx = loser.x - winner.x;
        const dy = loser.y - winner.y;
        const distance = Math.hypot(dx, dy) || 1;
        const awayX = dx / distance;
        const awayY = dy / distance;
        const sideX = -awayY;
        const sideY = awayX;
        const spread = Math.max(65, loser.size * 1.4);
        const now = Date.now();
        const makeFragment = (members: Player[], direction: number, id: string): Slime => {
          const ratio = members.length / loser.members.length;
          const x = Math.max(40, Math.min(MAP_WIDTH - 40, loser.x + awayX * 45 + sideX * spread * direction));
          const y = Math.max(40, Math.min(MAP_HEIGHT - 40, loser.y + awayY * 45 + sideY * spread * direction));
          const size = Math.max(24, loser.size * Math.sqrt(ratio));
          const memberIds = new Set(members.map(member => member.id));
          const memberTargets = Object.fromEntries(Object.entries(loser.memberTargets || {}).filter(([memberId]) => memberIds.has(memberId)));
          return { ...loser, id, x, y, targetX: x + sideX * 100 * direction, targetY: y + sideY * 100 * direction, size, color: members[0]?.color || loser.color, members, memberTargets, isDead: false, spawnedAt: now, invulnerableUntil: now + 5000 };
        };
        newSlimes[loserIndex] = makeFragment(firstMembers, -1, loser.id);
        newSlimes.push(makeFragment(secondMembers, 1, `${loser.id}-split-${now}`));
        newSlimes[winnerIndex] = { ...winner, size: winner.size + Math.min(8, loser.size * .12) };
      } else {
        newSlimes[winnerIndex] = {
          ...winner,
          size: winner.size + loser.size * 0.5,
          color: winner.members[0]?.color || winner.color,
          members: [...winner.members, ...loser.members],
          memberTargets: { ...(winner.memberTargets || {}), ...(loser.memberTargets || {}) },
        };
        newSlimes[loserIndex] = { ...loser, isDead: true };
      }
      
      return newSlimes;
    });
    audio.playImpact();
  }, [setEncounters, setSlimes]);

  // Resolution cleanup must survive reloads. Older snapshots have no
  // `resolvedAt`; those legacy resolved encounters are stale and are removed
  // immediately instead of reopening an uncloseable result modal.
  useEffect(() => {
    const timers = encounters.filter(encounter => encounter.resolved).map(encounter => {
      const deadline = encounter.result?.resolvedAt ? encounter.result.resolvedAt + 5_500 : Date.now();
      return window.setTimeout(() => {
        resolvingRef.current.delete(encounter.id);
        setEncounters(previous => previous.filter(item => item.id !== encounter.id));
      }, Math.max(0, deadline - Date.now()));
    });
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [encounters, setEncounters]);

  // A partially-written or legacy snapshot may reference a slime that no
  // longer exists. The elected host drops that encounter so it cannot keep
  // both the combat UI and collision lock alive forever.
  useEffect(() => {
    if (!isHost) return;
    const liveIds = new Set(slimes.filter(slime => !slime.isDead).map(slime => slime.id));
    const orphanIds = encounters
      .filter(encounter => !encounter.resolved && (!liveIds.has(encounter.slime1Id) || !liveIds.has(encounter.slime2Id)))
      .map(encounter => encounter.id);
    if (!orphanIds.length) return;
    orphanIds.forEach(id => resolvingRef.current.delete(id));
    const orphanSet = new Set(orphanIds);
    setEncounters(previous => previous.filter(encounter => !orphanSet.has(encounter.id)));
  }, [encounters, isHost, setEncounters, slimes]);

  useEffect(() => {
    encounters.forEach(encounter => {
      if (!encounter.resolved || !encounter.result || shownEffectsRef.current.has(encounter.id)) return;
      shownEffectsRef.current.add(encounter.id);
      const loser = slimes.find(slime => slime.id === encounter.result?.loserSlimeId);
      const winner = slimes.find(slime => slime.id === encounter.result?.winnerSlimeId);
      const anchor = loser || winner;
      if (!anchor) return;
      const loserFragments = slimes.filter(slime =>
        slime.id === encounter.result?.loserSlimeId || slime.id.startsWith(`${encounter.result?.loserSlimeId}-split-`)
      );
      const playerLost = loserFragments.some(slime => slime.members.some(member => member.id === player.id));
      const playerWon = !playerLost && Boolean(winner?.members.some(member => member.id === player.id));
      const playerResult = isSpectator ? undefined : playerLost ? 'lose' : playerWon ? 'win' : undefined;
      const playerSlime = playerLost ? loserFragments.find(slime => slime.members.some(member => member.id === player.id)) : winner;
      const effect: BattleEffect = {
        id: encounter.id,
        x: anchor.x,
        y: anchor.y,
        color: playerSlime?.color || anchor.color,
        colors: playerSlime?.members.map(member => member.color) || anchor.members.map(member => member.color),
        outcome: encounter.result.outcome,
        playerResult,
      };
      setBattleEffects(previous => [...previous, effect]);
      if (effect.outcome === 'split') audio.playSplit(); else audio.playDevour();
      if (playerResult) audio.playBattleResult(playerResult === 'win');
      window.setTimeout(() => setBattleEffects(previous => previous.filter(item => item.id !== effect.id)), playerResult ? 3400 : 2600);
    });
  }, [encounters, isSpectator, player.id, slimes]);

  useEffect(() => {
    if (!isHost) return;
    const check = () => encountersRef.current.forEach(encounter => {
        if (encounter.resolved || resolvingRef.current.has(encounter.id)) return;
        const team1 = slimesRef.current.find(slime => slime.id === encounter.slime1Id);
        const team2 = slimesRef.current.find(slime => slime.id === encounter.slime2Id);
        if (!team1 || !team2) return;
        const team1Ready = team1.members.every(member => encounter.votes1[member.id] !== undefined);
        const team2Ready = team2.members.every(member => encounter.votes2[member.id] !== undefined);
        if ((team1Ready && team2Ready) || Date.now() >= encounter.startTime + 20_000) resolveEncounter(encounter);
      });
    check();
    const timer = setInterval(check, 250);
    return () => clearInterval(timer);
  }, [encounters, isHost, resolveEncounter, slimes]);

  // --- Input Handling ---
  const issueMove = (clientX: number, clientY: number) => {
    const mySlimeId = slimes.find(slime => slime.members.some(member => member.id === player.id))?.id;
    if (isSpectator || encounters.some(encounter => !encounter.resolved && (encounter.slime1Id === mySlimeId || encounter.slime2Id === mySlimeId))) return;
    if (!containerRef.current) return;

    audio.playSquish();

    const rect = containerRef.current.getBoundingClientRect();
    // Calculate click position relative to the map, accounting for camera offset
    const clickX = (clientX - rect.left) / playerMapScale + cameraPos.x;
    const clickY = (clientY - rect.top) / playerMapScale + cameraPos.y;

    // Add ripple effect
    const newRipple = { id: Date.now(), x: clickX, y: clickY };
    setRipples(prev => [...prev, newRipple]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 600);

    // Update player slime target
    onMove(clickX, clickY);
  };

  const handleMapPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.pointerType === 'touch') lastTouchInputAt.current = Date.now();
    event.preventDefault();
    issueMove(event.clientX, event.clientY);
  };

  const handleMapTouch = (event: React.TouchEvent<HTMLDivElement>) => {
    if (Date.now() - lastTouchInputAt.current < 120) return;
    const touch = event.touches[0];
    if (!touch) return;
    lastTouchInputAt.current = Date.now();
    event.preventDefault();
    issueMove(touch.clientX, touch.clientY);
  };

  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastTouchInputAt.current < 700) return;
    issueMove(event.clientX, event.clientY);
  };

  // --- Camera Follow ---
  useLayoutEffect(() => {
    if (isSpectator) return;
    const mySlime = slimes.find(s => s.members.some(m => m.id === player.id) && !s.isDead);
    if (!mySlime || viewport.width <= 0 || viewport.height <= 0) return;
    const scale = mapScaleForSlime(mySlime.size);
    // Keep the controlled slime exactly at the visual center. Smooth camera
    // interpolation created a permanent offset while a slime was moving,
    // which was especially disruptive on narrow phone screens.
    setCameraPos({
      x: mySlime.x - viewport.width / (2 * scale),
      y: mySlime.y - viewport.height / (2 * scale),
    });
  }, [slimes, player.id, isSpectator, viewport.height, viewport.width]);

  // --- Render Helpers ---
  const encounterHasPlayer = (encounter: Encounter) =>
    encounter.participants1?.some(member => member.id === player.id) ||
    encounter.participants2?.some(member => member.id === player.id) ||
    slimes.find(s => s.id === encounter.slime1Id)?.members.some(m => m.id === player.id) ||
    slimes.find(s => s.id === encounter.slime2Id)?.members.some(m => m.id === player.id) ||
    (encounter.resolved && encounter.result?.outcome === 'split' && slimes.some(s => s.id.startsWith(`${encounter.result!.loserSlimeId}-split-`) && s.members.some(m => m.id === player.id)));
  const playerEncounters = isSpectator ? [] : encounters.filter(encounterHasPlayer);
  const encounterPlayerSlimeId = (encounter: Encounter) => {
    if (encounter.participants1?.some(member => member.id === player.id)) return encounter.slime1Id;
    if (encounter.participants2?.some(member => member.id === player.id)) return encounter.slime2Id;
    if (slimes.find(slime => slime.id === encounter.slime1Id)?.members.some(member => member.id === player.id)) return encounter.slime1Id;
    if (slimes.find(slime => slime.id === encounter.slime2Id)?.members.some(member => member.id === player.id)) return encounter.slime2Id;
    return undefined;
  };
  const encounterPlayerWon = (encounter: Encounter) =>
    Boolean(encounter.result?.winnerSlimeId && encounter.result.winnerSlimeId === encounterPlayerSlimeId(encounter));
  const playerEncounterIds = new Set(playerEncounters.map(encounter => encounter.id));
  const otherEncounters = encounters.filter(encounter => !playerEncounterIds.has(encounter.id));
  const spectatorScale = Math.max(.18, Math.min(viewport.width / MAP_WIDTH, viewport.height / MAP_HEIGHT) * .94);
  const controlledSlime = isSpectator ? undefined : slimes.find(slime => !slime.isDead && slime.members.some(member => member.id === player.id));
  const playerMapScale = controlledSlime ? mapScaleForSlime(controlledSlime.size) : 1;
  const mapTransform = isSpectator
    ? `translate(${(viewport.width - MAP_WIDTH * spectatorScale) / 2}px, ${(viewport.height - MAP_HEIGHT * spectatorScale) / 2}px) scale(${spectatorScale})`
    : `translate(${-cameraPos.x * playerMapScale}px, ${-cameraPos.y * playerMapScale}px) scale(${playerMapScale})`;
  const liveSlimeCount = slimes.filter(slime => !slime.isDead && slime.members.length > 0).length;

  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-slate-900 overflow-hidden relative cursor-crosshair touch-none overscroll-none"
      onPointerDown={handleMapPointer}
      onTouchStart={handleMapTouch}
      onClick={handleMapClick}
    >
      {/* Grid Background */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
          backgroundSize: `${40 * playerMapScale}px ${40 * playerMapScale}px`,
          transform: `translate(${(-cameraPos.x * playerMapScale) % (40 * playerMapScale)}px, ${(-cameraPos.y * playerMapScale) % (40 * playerMapScale)}px)`
        }}
      />

      {/* Map Container (moves opposite to camera) */}
      <div 
        className="absolute top-0 left-0"
        style={{
          width: MAP_WIDTH,
          height: MAP_HEIGHT,
          transform: mapTransform,
          transformOrigin: 'top left',
          transition: isSpectator ? 'transform 0.1s linear' : 'transform 0.18s ease-out'
        }}
      >
        {/* Shrinking Zone */}
        <div 
          className="absolute border-4 border-red-500/80 bg-red-500/10 pointer-events-none transition-all duration-1000 shadow-[0_0_50px_rgba(239,68,68,0.3)_inset]"
          style={{
            left: MAP_WIDTH / 2 - (MAP_WIDTH * zoneSize) / 2,
            top: MAP_HEIGHT / 2 - (MAP_HEIGHT * zoneSize) / 2,
            width: MAP_WIDTH * zoneSize,
            height: MAP_HEIGHT * zoneSize,
            borderRadius: '40px' // Slightly rounded corners for the zone
          }}
        />

        {/* Ripples */}
        {ripples.map(r => (
          <div
            key={r.id}
            className="absolute rounded-full border-2 border-white/50 animate-ripple pointer-events-none"
            style={{
              left: r.x - 10,
              top: r.y - 10,
              width: 20,
              height: 20
            }}
          />
        ))}

        {battleEffects.map(effect => (
          <div key={effect.id} className="absolute z-50 pointer-events-none" style={{ left: effect.x, top: effect.y, color: effect.color }}>
            <div className={`battle-burst ${effect.outcome}`} />
            {effect.outcome === 'split' ? <>
              <div className="split-fragment split-left">💥</div>
              <div className="split-fragment split-right">💥</div>
              <div className="battle-word">{t('battle.splitFx')}</div>
            </> : <>
              <div className="devour-vortex">🌀</div>
              <div className="battle-word">{t('battle.devourFx')}</div>
            </>}
          </div>
        ))}

        {/* Slimes */}
        {slimes.filter(s => !s.isDead).map(slime => {
          const isMySlime = slime.members.some(m => m.id === player.id);
          const mainMember = slime.members[0];
          const otherMembers = slime.members.slice(1);
          const gazeDx = slime.targetX - slime.x;
          const gazeDy = slime.targetY - slime.y;
          const gazeDistance = Math.hypot(gazeDx, gazeDy);
          const gazeX = gazeDistance > 5 ? gazeDx / gazeDistance : 0;
          const gazeY = gazeDistance > 5 ? gazeDy / gazeDistance : 0;

          return (
            <div
              key={slime.id}
              className={`absolute flex items-center justify-center transition-all duration-100 ease-linear ${isMySlime ? 'z-20' : 'z-10'} ${slime.spawnedAt ? 'slime-split-spawn' : ''}`}
              style={{
                left: slime.x - slime.size,
                top: slime.y - slime.size,
                width: slime.size * 2,
                height: slime.size * 2,
                animationDelay: `${Math.random()}s`
              }}
            >
              <SlimeAvatar color={mainMember.color || slime.color} colors={slime.members.map(member => member.color)} gazeX={gazeX} gazeY={gazeY} className="absolute inset-[-20%]" />
              
              {/* Main Name Tag */}
              <div className="absolute -bottom-8 whitespace-nowrap text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full pointer-events-none border border-white/20 shadow-lg">
                {mainMember.name}
                {slime.members.length > 1 && <span className="ml-2 text-yellow-300">⚡ {t('trivia.team')}</span>}
              </div>

              {/* Waving Flags for other members */}
              {otherMembers.length > 0 && (
                <div className="absolute top-1/4 left-full ml-1 flex flex-col gap-1 pointer-events-none">
                  {otherMembers.map((m, idx) => (
                    <div 
                      key={m.id} 
                      className="animate-wave bg-white/90 text-slate-900 text-xs font-bold px-2 py-0.5 rounded-r-md border-l-4 shadow-sm whitespace-nowrap"
                      style={{ 
                        borderLeftColor: m.color,
                        animationDelay: `${idx * 0.15}s` 
                      }}
                    >
                      {m.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Spectators can see that an active duel is locked and cannot accept
            a third challenger. The spark sits exactly between both slimes. */}
        {isSpectator && encounters.filter(encounter => !encounter.resolved).map(encounter => {
          const first = slimes.find(slime => slime.id === encounter.slime1Id && !slime.isDead);
          const second = slimes.find(slime => slime.id === encounter.slime2Id && !slime.isDead);
          if (!first || !second) return null;
          return <div key={`duel-lock-${encounter.id}`} className="duel-lock-spark" style={{ left: (first.x + second.x) / 2, top: (first.y + second.y) / 2 }} aria-label="Duel locked">
            <span>⚡</span><span>✦</span><span>⚡</span>
          </div>;
        })}

        {/* Spectator battle telemetry attached to the combatants. */}
        {isSpectator && encounters.map(encounter => {
          const first = slimes.find(s => s.id === encounter.slime1Id);
          const second = slimes.find(s => s.id === encounter.slime2Id);
          if (!first || !second) return null;
          const x = (first.x + second.x) / 2;
          const y = Math.min(first.y - first.size, second.y - second.size) - 22;
          const voteLabel = (votes: Record<string, number>, total: number) => `${Object.keys(votes).length}/${total}`;
          return <div key={`map-${encounter.id}`} className="absolute z-40 w-72 pointer-events-none" style={{ left: x, top: y, transform: `translate(-50%, -100%) scale(${1 / spectatorScale})`, transformOrigin: 'bottom center' }}>
            <div className={`rounded-xl border-2 px-3 py-2 text-center shadow-[0_0_30px_rgba(244,63,94,.55)] backdrop-blur-md ${encounter.resolved ? 'bg-emerald-950/95 border-yellow-300' : 'bg-slate-950/95 border-rose-400'}`}>
              <div className="text-[10px] font-black tracking-[.2em] text-rose-300">{encounter.resolved ? t('battle.result') : t('battle.now')}</div>
              <div className="text-sm font-bold text-white line-clamp-2 mt-1">❓ {encounter.question.text}</div>
              <div className="flex items-center justify-between gap-2 mt-2 text-xs font-black">
                <span className="text-blue-300 truncate">{first.members[0]?.name} · {voteLabel(encounter.votes1, first.members.length)}</span>
                <b className="text-rose-400">VS</b>
                <span className="text-rose-300 truncate">{second.members[0]?.name} · {voteLabel(encounter.votes2, second.members.length)}</span>
              </div>
              {encounter.resolved && <div className="mt-2 text-yellow-300 font-black">🏆 {encounter.result?.winnerName}　✓ {['A','B','C','D'][encounter.question.correctIndex]}</div>}
            </div>
            <div className="mx-auto h-5 w-px bg-rose-300" />
          </div>;
        })}
      </div>

      {/* The local player's result gets a screen-space cinematic so it cannot
          be missed even when the map collision happened off camera. */}
      {battleEffects.filter(effect => effect.playerResult).map(effect => (
        <div key={`player-${effect.id}`} className={`player-battle-cinematic ${effect.playerResult} ${effect.outcome}`}>
          <div className="player-cinematic-flash" />
          <div className="player-cinematic-ring" />
          {effect.playerResult === 'win' ? (
            <div className="player-cinematic-winner">
              <SlimeAvatar color={effect.color} colors={effect.colors} className="player-winner-slime w-[42vmin] h-[42vmin]" />
              <div className="player-cinematic-title">⚡ {t('battle.youWin')} ⚡</div>
            </div>
          ) : effect.outcome === 'split' ? (
            <div className="player-cinematic-loser">
              <div className="player-split-piece player-split-piece-left"><SlimeAvatar color={effect.color} colors={effect.colors} className="w-[38vmin] h-[38vmin]" /></div>
              <div className="player-split-piece player-split-piece-right"><SlimeAvatar color={effect.color} colors={effect.colors} className="w-[38vmin] h-[38vmin]" /></div>
              <div className="player-cinematic-impact">💥</div>
              <div className="player-cinematic-title">{t('battle.youLose')}</div>
            </div>
          ) : (
            <div className="player-cinematic-loser">
              <div className="player-devoured-slime"><SlimeAvatar color={effect.color} colors={effect.colors} className="w-[42vmin] h-[42vmin]" /></div>
              <div className="player-devour-hole">🌀</div>
              <div className="player-cinematic-title">{t('battle.youLose')}</div>
            </div>
          )}
        </div>
      ))}

      {/* UI Overlay */}
      <div className="absolute left-3 z-30 pointer-events-none" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
        <div className="bg-black/50 text-white px-4 py-2 rounded-lg backdrop-blur-sm border border-white/10">
          <p className="font-bold text-emerald-400">{t('game.survive')}</p>
          <p className="text-sm font-black text-cyan-300">🟢 {t('game.slimesRemaining')}: {liveSlimeCount}</p>
          <p className="text-sm text-slate-300">{t('game.timeRemaining')}: {Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')}</p>
          <p className="text-sm text-red-400">{t('game.zone')}: {Math.round(zoneSize * 100)}%</p>
        </div>
      </div>
      <FullscreenCountdown value={remainingTime} label={t('countdown.matchEnd')} />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,34rem)] space-y-3 pointer-events-none">
        {playerEncounters.filter(encounter => encounter.resolved && encounter.result).map(encounter => (
          <div key={`result-${encounter.id}`} className={`battle-result-banner ${encounterPlayerWon(encounter) ? 'player-win' : 'player-lose'}`}>
            <div className="text-xs tracking-[.25em] font-black text-white/70">⚔ {t('battle.result')}</div>
            <div className="mt-1 text-3xl sm:text-4xl font-black text-white">
              {encounterPlayerWon(encounter) ? t('battle.youWin') : t('battle.youLose')}
            </div>
          </div>
        ))}
      </div>
      {isSpectator && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-violet-500/20 border border-violet-300/40 text-violet-100 font-black backdrop-blur-md pointer-events-none">👁 {t('game.spectatorDetail')}</div>}

      {otherEncounters.length > 0 && <aside className="absolute bottom-36 left-3 right-24 z-30 flex items-end gap-2 overflow-hidden pointer-events-none">{otherEncounters.slice(-4).map((battle, i) => {
        const a = battle.participants1 || slimes.find(s=>s.id===battle.slime1Id)?.members || [];
        const b = battle.participants2 || slimes.find(s=>s.id===battle.slime2Id)?.members || [];
        return <div key={battle.id} className={`min-w-0 max-w-60 flex-1 bg-slate-950/78 border rounded-lg px-2.5 py-1.5 shadow-lg backdrop-blur-sm ${battle.resolved ? 'border-yellow-300/35' : 'border-rose-400/30'}`}>
          <div className="flex items-center gap-1.5 text-[10px] leading-tight font-bold text-slate-300 truncate"><span className={battle.resolved ? 'text-yellow-300' : 'text-rose-300'}>{battle.resolved ? t('battle.result') : `${t('battle.now')} ${i + 1}`}</span><span className="truncate">{a[0]?.name || 'A'}</span><b className="text-rose-400">VS</b><span className="truncate">{b[0]?.name || 'B'}</span></div>
          <div className="mt-0.5 text-[9px] leading-tight text-slate-400 truncate">{battle.resolved && battle.result ? `🏆 ${battle.result.winnerName} · ✓ ${['A','B','C','D'][battle.question.correctIndex]}` : `🗳 ${Object.keys(battle.votes1).length}/${a.length} · ${Object.keys(battle.votes2).length}/${b.length}`}</div>
        </div>;
      })}</aside>}

      {/* Trivia Modal */}
      {playerEncounters.map((encounter, encounterIndex) => (
        <TriviaModal 
          key={encounter.id}
          t={t} 
          encounter={encounter} 
          player={player}
          slimes={slimes}
          onVote={(idx) => {
            onVote(encounter.id, idx);
          }}
        />
      ))}
    </div>
  );
};

export default GameBoard;
