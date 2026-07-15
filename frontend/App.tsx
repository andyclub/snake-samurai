import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GamePhase, Language, Player, Slime, Encounter } from './types';
import { translations, getBrowserLanguage } from './i18n';
import { Globe, Terminal, HelpCircle, X } from 'lucide-react';
import GameOffScreen from './components/GameOffScreen';
import LobbyScreen from './components/LobbyScreen';
import GameBoard from './components/GameBoard';
import TheaterScreen from './components/TheaterScreen';
import { audio } from './audio';

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(getBrowserLanguage());
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [phase, setPhase] = useState<GamePhase>(GamePhase.OFF);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCmd, setAdminCmd] = useState('');
  
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

  // Initialize Audio on first interaction
  useEffect(() => {
    const initAudio = () => audio.init();
    document.addEventListener('click', initAudio, { once: true });
    return () => document.removeEventListener('click', initAudio);
  }, []);

  // Handle BGM changes
  useEffect(() => {
    audio.setBGM(phase);
  }, [phase]);

  const executeCommand = useCallback((cmd: string) => {
    switch (cmd.trim()) {
      case '/jec.on':
        setPhase(prev => {
          if (prev === GamePhase.OFF) {
            setIsSpectator(false);
            return GamePhase.LOBBY;
          }
          return prev;
        });
        break;
      case '/jec.off':
        setPhase(GamePhase.OFF);
        setSlimes([]);
        setEncounter(null);
        break;
      case '/jec.restart':
        setPhase(GamePhase.LOBBY);
        setSlimes([]);
        setEncounter(null);
        setIsSpectator(false);
        break;
      default:
        break;
    }
  }, []);

  // Secret Admin Entrance Check & Hash Commands
  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash === '#/jec.on') {
        setIsAdmin(true);
      } else if (hash === '#/jec.off' && isAdmin) {
        executeCommand('/jec.off');
        window.location.hash = '#/jec.on';
      } else if (hash === '#/jec.restart' && isAdmin) {
        executeCommand('/jec.restart');
        window.location.hash = '#/jec.on';
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [isAdmin, executeCommand]);

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
      {/* Secret Admin Console */}
      {isAdmin && (
        <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-2">
          <div className="text-xs text-slate-400 bg-black/80 p-3 rounded-lg border border-slate-700 text-left backdrop-blur-md shadow-xl">
            <p className="text-emerald-400 font-bold mb-1 flex items-center gap-1"><Terminal className="w-3 h-3"/> Admin Console</p>
            <p className="hover:text-white cursor-pointer" onClick={() => setAdminCmd('/jec.on')}>/jec.on - 开启游戏</p>
            <p className="hover:text-white cursor-pointer" onClick={() => setAdminCmd('/jec.off')}>/jec.off - 强制停止</p>
            <p className="hover:text-white cursor-pointer" onClick={() => setAdminCmd('/jec.restart')}>/jec.restart - 强制重开</p>
          </div>
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              executeCommand(adminCmd); 
              setAdminCmd(''); 
            }}
            className="flex gap-2 bg-black/90 p-2 rounded-lg border border-emerald-500/50 backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.2)]"
          >
            <span className="text-emerald-400 font-mono py-1 pl-2">{'>'}</span>
            <input 
              type="text" 
              value={adminCmd}
              onChange={e => setAdminCmd(e.target.value)}
              placeholder="输入命令..."
              className="bg-transparent text-white font-mono outline-none w-48"
            />
          </form>
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-emerald-400">{t('rules.title')}</h2>
              <button 
                onClick={() => { audio.playPop(); setShowRules(false); }} 
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-3 text-slate-200 text-sm leading-relaxed">
              <p>{t('rules.1')}</p>
              <p>{t('rules.2')}</p>
              <p>{t('rules.3')}</p>
              <p>{t('rules.4')}</p>
              <p>{t('rules.5')}</p>
            </div>
            <button 
              onClick={() => { audio.playPop(); setShowRules(false); }}
              className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-colors"
            >
              {t('rules.close')}
            </button>
          </div>
        </div>
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

      {/* Custom Language Selector, Help & Version Info (Bottom Right) */}
      <div className="absolute bottom-6 right-6 z-50 flex items-center gap-3" ref={langMenuRef}>
        <div className="flex flex-col items-end text-xs text-slate-500/80 font-mono select-none pointer-events-none">
          <span>v156</span>
          <span>10-26-2023</span>
        </div>
        
        <button 
          onClick={() => {
            audio.playPop();
            setShowRules(true);
          }}
          className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/80 transition-colors border border-white/10 backdrop-blur-sm"
          title={t('rules.title')}
        >
          <HelpCircle className="w-6 h-6" />
        </button>

        <div className="relative">
          <button 
            onClick={() => {
              audio.playPop();
              setShowLangMenu(!showLangMenu);
            }}
            className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/80 transition-colors border border-white/10 backdrop-blur-sm"
            title="Change Language"
          >
            <Globe className="w-6 h-6" />
          </button>
          
          {showLangMenu && (
            <div className="absolute bottom-full right-0 mb-2 w-36 bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    audio.playPop();
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
      </div>
    </div>
  );
};

export default App;
