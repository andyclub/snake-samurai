import React, { useState } from 'react';
import { ArenaMode, Language, Player, Theme } from '../types';
import { Users, QrCode, Play, Sparkles, ShieldAlert, Globe, Compass, X, HelpCircle } from 'lucide-react';
import { saveLanguagePreference } from '../i18n';

interface Props {
  player: Player;
  players: Player[];
  selectedMode: ArenaMode;
  onSelectMode: (mode: ArenaMode, theme: Theme) => void;
  onUpdatePlayer: (name: string, color: string) => void;
  lang: Language;
  onSelectLanguage: (lang: Language) => void;
  lobbyEndsAt?: number | null;
  onStart: (mode?: ArenaMode, theme?: Theme) => void;
  t: (key: string) => string;
}

const PLAYER_COLORS = [
  '#ef4444', '#f97316', '#facc15', '#10b981',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

const INVITE_URL = 'https://h.kazeabc.com';
const QR_IMAGE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(INVITE_URL)}&color=38bdf8&bcolor=020617`;

export const LobbyScreen: React.FC<Props> = ({
  player,
  players,
  selectedMode,
  onSelectMode,
  onUpdatePlayer,
  lang,
  onSelectLanguage,
  lobbyEndsAt,
  onStart,
  t
}) => {
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showQRCodeModal, setShowQRCodeModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [nameInput, setNameInput] = useState(player.name);
  const [selectedColor, setSelectedColor] = useState(player.color);

  const secondsLeft = lobbyEndsAt ? Math.max(0, Math.ceil((lobbyEndsAt - Date.now()) / 1000)) : 30;

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    onUpdatePlayer(nameInput, color);
  };

  const handleNameBlur = () => {
    if (nameInput.trim()) {
      onUpdatePlayer(nameInput.trim(), selectedColor);
    }
  };

  const handleLaunchArena = (mode: ArenaMode, theme: Theme) => {
    onSelectMode(mode, theme);
    onStart(mode, theme);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] px-4 sm:px-8 overflow-y-auto">
      {/* Top Header: Title, FAQ, QR Code & Language Selector */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between z-20 gap-2 shrink-0 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-cyan-500/20 border border-cyan-500/40 rounded-2xl">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">{t('app.title')}</h1>
            <p className="text-[10px] sm:text-xs text-slate-400 font-mono font-bold">snake-samurai · v{__REPO_COMMIT_COUNT__} {__BUILD_DATE__}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* FAQ Modal Button */}
          <button
            type="button"
            onClick={() => setShowRulesModal(true)}
            className="touch-manipulation flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-white/10 hover:border-amber-400 rounded-full text-xs font-bold text-amber-300 transition-all shadow-lg active:scale-95 cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">{t('rules.title')}</span>
            <span className="sm:hidden">FAQ</span>
          </button>

          {/* QR Code Invitation Button */}
          <button
            type="button"
            onClick={() => setShowQRCodeModal(true)}
            className="touch-manipulation flex items-center gap-1.5 px-3 py-2 bg-cyan-950/80 border border-cyan-500/40 hover:border-cyan-400 rounded-full text-xs font-bold text-cyan-300 transition-all shadow-lg active:scale-95 cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">h.kazeabc.com</span>
            <span className="sm:hidden">邀请</span>
          </button>

          {/* Language Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="touch-manipulation flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-white/10 hover:border-cyan-400 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer"
            >
              <Globe className="w-4 h-4 text-cyan-400" />
              <span className="uppercase">{lang}</span>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-36 bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-30">
                {[
                  { code: 'zh-CN', label: '简体中文' },
                  { code: 'ja', label: '日本語' },
                  { code: 'en', label: 'English' },
                  { code: 'zh-TW', label: '繁體中文' }
                ].map(item => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      saveLanguagePreference(item.code as Language);
                      onSelectLanguage(item.code as Language);
                      setShowLangMenu(false);
                    }}
                    className={`touch-manipulation w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-slate-800 transition-colors ${
                      lang === item.code ? 'text-cyan-400 bg-cyan-950/40' : 'text-slate-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Center Cards: 3 Arena Cards & Direct Start Trigger */}
      <main className="w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-6 my-auto z-10 py-3">
        {/* 1. 初级场 (新手自由场) */}
        <button
          type="button"
          onClick={() => handleLaunchArena('free', 'free')}
          className={`touch-manipulation w-full text-left cursor-pointer rounded-3xl p-4 sm:p-6 border transition-all active:scale-98 ${
            selectedMode === 'free'
              ? 'bg-cyan-950/80 border-cyan-400 shadow-2xl shadow-cyan-500/30 ring-2 ring-cyan-400/50'
              : 'bg-slate-900/90 border-white/15 hover:border-cyan-400/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <span className="text-[11px] sm:text-xs font-black uppercase px-3 py-0.5 sm:py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              {t('arena.permanent')}
            </span>
            <Play className="w-5 h-5 text-cyan-400 fill-current" />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white mb-1 sm:mb-2">🟢 {t('arena.default')}</h2>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            新手自由场。不限制词汇主题，自由拼词组句，熟悉侍蛇游动与对战操作。
          </p>
          <div className="w-full py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs text-center flex items-center justify-center gap-1.5 shadow-lg">
            <Play className="w-4 h-4 fill-current" /> 点击立即进入自由场
          </div>
        </button>

        {/* 2. 主题场 (随机主题场) */}
        <button
          type="button"
          onClick={() => handleLaunchArena('random', 'travel')}
          className={`touch-manipulation w-full text-left cursor-pointer rounded-3xl p-4 sm:p-6 border transition-all active:scale-98 ${
            selectedMode === 'random'
              ? 'bg-amber-950/80 border-amber-400 shadow-2xl shadow-amber-500/30 ring-2 ring-amber-400/50'
              : 'bg-slate-900/90 border-white/15 hover:border-amber-400/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <span className="text-[11px] sm:text-xs font-black uppercase px-3 py-0.5 sm:py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {t('arena.open')}
            </span>
            <Play className="w-5 h-5 text-amber-400 fill-current" />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white mb-1 sm:mb-2">🟡 {t('arena.title')}</h2>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            随机抽签主题（旅行、学习、工作、生活、文化）。仅限与主题相符的词句结算。
          </p>
          <div className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs text-center flex items-center justify-center gap-1.5 shadow-lg">
            <Play className="w-4 h-4 fill-current" /> 点击立即进入主题场
          </div>
        </button>

        {/* 3. 防灾专场 (日本·富山市防灾) */}
        <button
          type="button"
          onClick={() => handleLaunchArena('disaster', 'disaster')}
          className={`touch-manipulation w-full text-left cursor-pointer rounded-3xl p-4 sm:p-6 border transition-all active:scale-98 ${
            selectedMode === 'disaster'
              ? 'bg-red-950/80 border-red-500 shadow-2xl shadow-red-500/30 ring-2 ring-red-500/50'
              : 'bg-slate-900/90 border-white/15 hover:border-red-400/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <span className="text-[11px] sm:text-xs font-black uppercase px-3 py-0.5 sm:py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
              {t('arena.disasterOnly')}
            </span>
            <Play className="w-5 h-5 text-red-400 fill-current" />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white mb-1 sm:mb-2">🔴 {t('arena.disaster')}</h2>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            日本·富山市防灾知识专场。包含地震、津波、避難所、高台避险等专业表达。
          </p>
          <div className="w-full py-2.5 rounded-xl bg-red-500 text-slate-950 font-black text-xs text-center flex items-center justify-center gap-1.5 shadow-lg">
            <Play className="w-4 h-4 fill-current" /> 点击立即进入防灾场
          </div>
        </button>
      </main>

      {/* Bottom Panel: Player Profile & Global Start Button */}
      <footer className="w-full max-w-4xl mx-auto bg-slate-900/90 border border-white/10 rounded-3xl p-4 sm:p-6 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 z-20 shrink-0 mt-2">
        {/* Nickname & Color Customization */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="space-y-1 flex-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('lobby.name')}</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleNameBlur}
              className="w-full md:w-48 bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('lobby.color')}</label>
            <div className="flex gap-1.5">
              {PLAYER_COLORS.map(c => (
                <button
                  type="button"
                  key={c}
                  onClick={() => handleColorSelect(c)}
                  className={`touch-manipulation w-6 h-6 rounded-full border-2 transition-transform ${
                    selectedColor === c ? 'scale-125 border-white shadow-md' : 'border-transparent opacity-70'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Start Button & Countdown */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-slate-400 font-bold uppercase">{t('trivia.time')}</div>
            <div className="text-xl font-mono font-black text-cyan-400">{secondsLeft}s</div>
          </div>

          <button
            type="button"
            onClick={() => onStart(selectedMode, selectedMode === 'disaster' ? 'disaster' : selectedMode === 'random' ? 'travel' : 'free')}
            className="touch-manipulation w-full sm:w-auto px-8 py-3.5 sm:py-4 bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-black text-base sm:text-lg rounded-2xl shadow-xl shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" /> {t('btn.startRound')}
          </button>
        </div>
      </footer>

      {/* FAQ / Rules Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 max-w-md w-full text-left space-y-4 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowRulesModal(false)}
              className="touch-manipulation absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <HelpCircle className="w-6 h-6 text-amber-400" />
              <h3 className="text-lg font-black text-white">{t('rules.title')}</h3>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>{t('rules.1')}</p>
              <p>{t('rules.2')}</p>
              <p>{t('rules.3')}</p>
              <p>{t('rules.4')}</p>
              <p>{t('rules.5')}</p>
            </div>

            <button
              type="button"
              onClick={() => setShowRulesModal(false)}
              className="touch-manipulation w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl"
            >
              {t('rules.close')}
            </button>
          </div>
        </div>
      )}

      {/* QR Code Invitation Modal */}
      {showQRCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-8 max-w-sm w-full text-center space-y-5 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowQRCodeModal(false)}
              className="touch-manipulation absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-center gap-2">
              <QrCode className="w-6 h-6 text-cyan-400" />
              <h3 className="text-lg font-black text-white">游戏邀请二维码</h3>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 inline-block shadow-inner">
              <img
                src={QR_IMAGE_URL}
                alt="Invite QR Code"
                className="w-48 h-48 rounded-xl object-contain"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-400">手机扫码或浏览器输入网址加入：</p>
              <a
                href={INVITE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 font-mono font-bold hover:underline text-sm block"
              >
                {INVITE_URL.replace('https://', '')}
              </a>
            </div>

            <button
              type="button"
              onClick={() => setShowQRCodeModal(false)}
              className="touch-manipulation w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl"
            >
              {t('rules.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LobbyScreen;
