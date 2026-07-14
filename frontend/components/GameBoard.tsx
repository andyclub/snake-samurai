import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Player, Slime, Encounter } from '../types';
import { MOCK_QUESTIONS, blendColors } from '../mockData';
import TriviaModal from './TriviaModal';
import { audio } from '../audio';

interface Props {
  t: (key: string) => string;
  player: Player;
  isSpectator: boolean;
  slimes: Slime[];
  setSlimes: React.Dispatch<React.SetStateAction<Slime[]>>;
  encounter: Encounter | null;
  setEncounter: React.Dispatch<React.SetStateAction<Encounter | null>>;
  onGameOver: () => void;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const TICK_RATE = 50; // ms per tick
const BASE_SPEED = 5;

const GameBoard: React.FC<Props> = ({ t, player, isSpectator, slimes, setSlimes, encounter, setEncounter, onGameOver }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [cameraPos, setCameraPos] = useState({ x: 0, y: 0 });
  const [zoneSize, setZoneSize] = useState(1); // 1 to 0.2
  const [gameTime, setGameTime] = useState(0);

  // Refs for mutable state accessed in game loop to avoid dependency cycles
  const slimesRef = useRef(slimes);
  const encounterRef = useRef(encounter);
  const zoneSizeRef = useRef(zoneSize);
  
  useEffect(() => {
    slimesRef.current = slimes;
  }, [slimes]);

  useEffect(() => {
    encounterRef.current = encounter;
  }, [encounter]);

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
        
        // Only update if not in an encounter
        if (!encounterRef.current) {
          updateGameLogic();
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Timer & Zone Shrink ---
  useEffect(() => {
    const timer = setInterval(() => {
      setGameTime(prev => {
        const newTime = prev + 1;
        // Shrink zone every 30s
        if (newTime % 30 === 0) {
          setZoneSize(z => Math.max(0.2, z - 0.1));
        }
        // End game at 5 mins (300s)
        if (newTime >= 300) {
          onGameOver();
        }
        return newTime;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onGameOver]);

  const updateGameLogic = useCallback(() => {
    let currentSlimes = [...slimesRef.current];
    const currentZoneSize = zoneSizeRef.current;
    
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

      // Bot logic: randomly change target
      if (slime.members.every(m => m.isBot) && Math.random() < 0.02) {
        slime.targetX = Math.max(minX, Math.min(maxX, slime.x + (Math.random() - 0.5) * 500));
        slime.targetY = Math.max(minY, Math.min(maxY, slime.y + (Math.random() - 0.5) * 500));
      }

      const dx = slime.targetX - slime.x;
      const dy = slime.targetY - slime.y;
      const dist = Math.hypot(dx, dy);

      let nextX = slime.x;
      let nextY = slime.y;

      if (dist > 5) {
        // Speed decreases slightly as size increases
        const speed = BASE_SPEED * (30 / slime.size);
        nextX += (dx / dist) * speed;
        nextY += (dy / dist) * speed;
      }

      // Boundary Enforcement (Force slime to stay inside the shrinking zone)
      nextX = Math.max(minX + slime.size, Math.min(maxX - slime.size, nextX));
      nextY = Math.max(minY + slime.size, Math.min(maxY - slime.size, nextY));
        
      return {
        ...slime,
        x: nextX,
        y: nextY
      };
    });

    // 2. Check Collisions
    let newEncounter: Encounter | null = null;
    for (let i = 0; i < currentSlimes.length; i++) {
      for (let j = i + 1; j < currentSlimes.length; j++) {
        const s1 = currentSlimes[i];
        const s2 = currentSlimes[j];
        if (s1.isDead || s2.isDead) continue;

        const dist = Math.hypot(s2.x - s1.x, s2.y - s1.y);
        if (dist < s1.size + s2.size) {
          // Collision detected!
          const q = MOCK_QUESTIONS[Math.floor(Math.random() * MOCK_QUESTIONS.length)];
          newEncounter = {
            id: `enc-${Date.now()}`,
            slime1Id: s1.id,
            slime2Id: s2.id,
            question: q,
            startTime: Date.now(),
            votes1: {},
            votes2: {},
            resolved: false
          };
          break;
        }
      }
      if (newEncounter) break;
    }

    if (newEncounter) {
      audio.playAlert();
      setEncounter(newEncounter);
      // Simulate bot votes immediately for simplicity in this prototype
      setTimeout(() => resolveEncounter(newEncounter!), 20000); // Auto resolve after 20s
    }

    // 3. Check Win Condition
    const aliveSlimes = currentSlimes.filter(s => !s.isDead);
    if (aliveSlimes.length <= 1 && currentSlimes.length > 1) {
      onGameOver();
    }

    setSlimes(currentSlimes);
  }, [onGameOver, setEncounter, setSlimes]);

  // --- Encounter Resolution ---
  const resolveEncounter = useCallback((enc: Encounter) => {
    setSlimes(prevSlimes => {
      const s1Index = prevSlimes.findIndex(s => s.id === enc.slime1Id);
      const s2Index = prevSlimes.findIndex(s => s.id === enc.slime2Id);
      if (s1Index === -1 || s2Index === -1) return prevSlimes;

      const s1 = prevSlimes[s1Index];
      const s2 = prevSlimes[s2Index];
      
      // Mock logic: Random winner for bots, or based on size if tie
      const s1Wins = Math.random() > 0.5; 
      
      const newSlimes = [...prevSlimes];
      
      if (s1Wins) {
        // S1 eats S2
        newSlimes[s1Index] = {
          ...s1,
          size: s1.size + s2.size * 0.5,
          color: blendColors(s1.color, s2.color),
          members: [...s1.members, ...s2.members]
        };
        newSlimes[s2Index] = { ...s2, isDead: true };
      } else {
        // S2 eats S1
        newSlimes[s2Index] = {
          ...s2,
          size: s2.size + s1.size * 0.5,
          color: blendColors(s2.color, s1.color),
          members: [...s2.members, ...s1.members]
        };
        newSlimes[s1Index] = { ...s1, isDead: true };
      }
      
      return newSlimes;
    });
    setEncounter(null);
  }, [setEncounter, setSlimes]);

  // --- Input Handling ---
  const handleMapClick = (e: React.MouseEvent) => {
    if (isSpectator || encounter) return;
    if (!containerRef.current) return;

    audio.playSquish();

    const rect = containerRef.current.getBoundingClientRect();
    // Calculate click position relative to the map, accounting for camera offset
    const clickX = e.clientX - rect.left + cameraPos.x;
    const clickY = e.clientY - rect.top + cameraPos.y;

    // Add ripple effect
    const newRipple = { id: Date.now(), x: clickX, y: clickY };
    setRipples(prev => [...prev, newRipple]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 600);

    // Update player slime target
    setSlimes(prev => prev.map(s => {
      if (s.members.some(m => m.id === player.id)) {
        return { ...s, targetX: clickX, targetY: clickY };
      }
      return s;
    }));
  };

  // --- Camera Follow ---
  useEffect(() => {
    if (isSpectator) return;
    const mySlime = slimes.find(s => s.members.some(m => m.id === player.id) && !s.isDead);
    if (mySlime && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // Center camera on player
      const targetCamX = mySlime.x - rect.width / 2;
      const targetCamY = mySlime.y - rect.height / 2;
      
      // Smooth camera movement
      setCameraPos(prev => ({
        x: prev.x + (targetCamX - prev.x) * 0.1,
        y: prev.y + (targetCamY - prev.y) * 0.1
      }));
    }
  }, [slimes, player.id, isSpectator]);

  // --- Render Helpers ---
  const isPlayerInEncounter = encounter && (
    slimes.find(s => s.id === encounter.slime1Id)?.members.some(m => m.id === player.id) ||
    slimes.find(s => s.id === encounter.slime2Id)?.members.some(m => m.id === player.id)
  );

  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-slate-900 overflow-hidden relative cursor-crosshair"
      onClick={handleMapClick}
    >
      {/* Grid Background */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          transform: `translate(${-cameraPos.x % 40}px, ${-cameraPos.y % 40}px)`
        }}
      />

      {/* Map Container (moves opposite to camera) */}
      <div 
        className="absolute top-0 left-0"
        style={{
          width: MAP_WIDTH,
          height: MAP_HEIGHT,
          transform: `translate(${-cameraPos.x}px, ${-cameraPos.y}px)`,
          transition: 'transform 0.1s linear'
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

        {/* Slimes */}
        {slimes.filter(s => !s.isDead).map(slime => {
          const isMySlime = slime.members.some(m => m.id === player.id);
          const mainMember = slime.members[0];
          const otherMembers = slime.members.slice(1);

          return (
            <div
              key={slime.id}
              className={`absolute flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.3)] transition-all duration-100 ease-linear slime-shape ${isMySlime ? 'z-20' : 'z-10'}`}
              style={{
                left: slime.x - slime.size,
                top: slime.y - slime.size,
                width: slime.size * 2,
                height: slime.size * 2,
                backgroundColor: slime.color + 'E6', // 90% opacity
                border: `4px solid ${slime.color}`,
                animationDelay: `${Math.random()}s`
              }}
            >
              {/* Comic Eyes */}
              <div className="absolute top-[25%] flex gap-2 pointer-events-none">
                <div className="w-2 h-4 bg-slate-900 rounded-full relative">
                  <div className="absolute top-0.5 right-0.5 w-1 h-1.5 bg-white rounded-full"></div>
                </div>
                <div className="w-2 h-4 bg-slate-900 rounded-full relative">
                  <div className="absolute top-0.5 right-0.5 w-1 h-1.5 bg-white rounded-full"></div>
                </div>
              </div>

              {/* Inner core highlight */}
              <div className="w-1/2 h-1/2 rounded-full bg-white/20 blur-md pointer-events-none" />
              
              {/* Main Name Tag */}
              <div className="absolute -bottom-8 whitespace-nowrap text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full pointer-events-none border border-white/20 shadow-lg">
                {mainMember.name}
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
      </div>

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 pointer-events-none">
        <div className="bg-black/50 text-white px-4 py-2 rounded-lg backdrop-blur-sm border border-white/10">
          <p className="font-bold text-emerald-400">{t('game.survive')}</p>
          <p className="text-sm text-slate-300">Time: {Math.floor(gameTime / 60)}:{(gameTime % 60).toString().padStart(2, '0')}</p>
          <p className="text-sm text-red-400">{t('game.zone')}: {Math.round(zoneSize * 100)}%</p>
        </div>
      </div>

      {/* Trivia Modal */}
      {encounter && isPlayerInEncounter && (
        <TriviaModal 
          t={t} 
          encounter={encounter} 
          player={player}
          onVote={(idx) => {
            // In a real app, send vote to server
            console.log("Voted for", idx);
          }}
        />
      )}
    </div>
  );
};

export default GameBoard;
