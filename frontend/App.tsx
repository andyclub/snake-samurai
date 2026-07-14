import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GamePhase, Language, Player, Slime, Encounter } from './types';
import { translations, getBrowserLanguage } from './i18n';
import { Globe, Settings, Power } from 'lucide-react';
import GameOffScreen from './components/GameOffScreen';
import LobbyScreen from './components/LobbyScreen';
import GameBoard from './components/GameBoard';
import TheaterScreen from './components/TheaterScreen';

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(getBrowserLanguage());
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [phase, setPhase] = useState<GamePhase>(GamePhase.OFF);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Player State with LocalStorage Memory
  const [player, setPlayer] = useState<Player>(() => {
    const savedName = localStorage.getItem('kazeabc_name');
    const savedColor = localStorage.getItem('kazeabc_color');
    return {
      id: `p-${Date.now()}`,
      name: savedName || 'Player',
      color: savedColor || '#3b82f6',
      isBot: false
    };
  });

  // Game State
  const [slimes, setSlimes] = useState<Slime[]>([]);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);

  const langMenuRef = useRef<HTMLDivElement>(null);

  const t = useCallback((key: string) => translations[lang][key] || key, [lang]);

  // Secret Admin Entrance Check
  useEffect(() => {
    const checkHash = () => {
      setIsAdmin(window.location.hash === '#admin');
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // Close lang menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleGame = () => {
    if (phase === GamePhase.OFF) {
      setPhase(GamePhase.LOBBY);
      setIsSpectator(false);
    } else {
      setPhase(GamePhase.OFF);
      setSlimes([]);
      setEncounter(null);
    }
  };

  const handleJoinGame = (updatedPlayer: Player) => {
    setPlayer(updatedPlayer);
    localStorage.setItem('kazeabc_name', updatedPlayer.name);
    localStorage.setItem('kazeabc_color', updatedPlayer.color);
  };

  const handleStartGame = (initialSlimes: Slime[]) => {
    setSlimes(initialSlimes);
    setPhase(GamePhase.PLAYING);
  };

  const handleGameOver = () => {
    setPhase(GamePhase.THEATER);
  };

  const languages: { code: Language; label: string }[] = [
    { code: 'zh-CN', label: '简体中文' },
    { code: 'ja', label: '日本語' },
    { code: 'en', label: 'English' },
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'ko', label: '한국어' },
    { code: 'fr', label: 'Français' },
    { code: 'nl', label: 'Nederlands' }
  ];

  return (
    <div className="relative w-full h-full font-sans">
      {/* Custom Language Selector */}
      <div className="absolute top-4 right-4 z-50" ref={langMenuRef}>
        <button 
          onClick={() => setShowLangMenu(!showLangMenu)}
          className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/80 transition-colors border border-white/10 backdrop-blur-sm"
          title="Change Language"
        >
          <Globe className="w-6 h-6" />
        </button>
        
        {showLangMenu && (
          <div className="absolute right-0 mt-2 w-36 bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
            {languages.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  setLang(l.code);
                  setShowLangMenu(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  lang === l.code ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Secret Admin Toggle (Only visible if URL hash is #admin) */}
      {isAdmin && (
        <button 
          onClick={toggleGame}
          className={`absolute bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full font-bold transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)] border ${
            phase === GamePhase.OFF 
              ? 'bg-emerald-600/80 hover:bg-emerald-500 border-emerald-400 text-white' 
              : 'bg-red-600/80 hover:bg-red-500 border-red-400 text-white'
          }`}
          title={t('admin.toggle')}
        >
          {phase === GamePhase.OFF ? <Power className="w-5 h-5" /> : <Settings className="w-5 h-5 animate-spin-slow" />}
          <span>{phase === GamePhase.OFF ? 'Admin: 开启游戏' : 'Admin: 强制结束'}</span>
        </button>
      )}

      {/* Main Routing */}
      {phase === GamePhase.OFF && <GameOffScreen t={t} />}
      
      {phase === GamePhase.LOBBY && (
        <LobbyScreen 
          t={t} 
          player={player} 
          onUpdatePlayer={handleJoinGame}
          onStart={handleStartGame}
          setIsSpectator={setIsSpectator}
        />
      )}

      {phase === GamePhase.PLAYING && (
        <GameBoard 
          t={t}
          player={player}
          isSpectator={isSpectator}
          slimes={slimes}
          setSlimes={setSlimes}
          encounter={encounter}
          setEncounter={setEncounter}
          onGameOver={handleGameOver}
        />
      )}

      {phase === GamePhase.THEATER && (
        <TheaterScreen 
          t={t} 
          slimes={slimes} 
          player={player}
          onRestart={() => setPhase(GamePhase.LOBBY)} 
        />
      )}
    </div>
  );
};

export default App;
