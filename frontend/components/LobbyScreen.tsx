import React, { useState } from 'react';
import { ArenaMode, Language, Player, Theme } from '../types';
import { Users, QrCode, Play, Sparkles, ShieldAlert, Globe, Compass, X } from 'lucide-react';
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
  onStart: () => void;
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-between p-6 select-none overflow-y-auto">
      {/* Top Header: Title, QR Code Invite & Language Selector */}
      <header className="w-full max-w-4xl flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 border border-cyan-500/40 rounded-2xl">
            <Sparkles className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">聴風・侍蛇</h1>
            <p className="text-xs text-slate-400">snake-samurai</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* QR Code Invitation Button */}
          <button
            onClick={() => setShowQRCodeModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-950/80 border border-cyan-500/40 hover:border-cyan-400 rounded-full text-xs font-bold text-cyan-300 transition-all shadow-lg"
          >
            <QrCode className="w-4 h-4 text-cyan-400" />
            <span>邀请二维码 (h.kazeabc.com)</span>
          </button>

          {/* Language Menu */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-white/10 hover:border-cyan-400 rounded-full text-xs font-bold transition-all"
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
                    onClick={() => {
                      saveLanguagePreference(item.code as Language);
                      onSelectLanguage(item.code as Language);
                      setShowLangMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-slate-800 transition-colors ${
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

      {/* Center Cards: 3 Arena Cards & Player Config */}
      <main className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6 my-auto z-10 py-4">
        {/* 1. 初级场 (新手自由场) */}
        <div
          onClick={() => onSelectMode('free', 'free')}
          className={`cursor-pointer rounded-3xl p-6 border transition-all ${
            selectedMode === 'free'
              ? 'bg-cyan-950/60 border-cyan-400 shadow-xl shadow-cyan-500/20 scale-102'
              : 'bg-slate-900/80 border-white/10 hover:border-cyan-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black uppercase px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              常驻场
            </span>
            {selectedMode === 'free' && <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />}
          </div>
          <h2 className="text-xl font-black text-white mb-2">🟢 初级场</h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            新手自由场。不限制词汇主题，自由拼词组句，熟悉侍蛇游动与对战操作。
          </p>
          <div className="text-[11px] text-cyan-300 font-bold">主题：不限自由</div>
        </div>

        {/* 2. 主题场 (随机主题场) */}
        <div
          onClick={() => onSelectMode('random', 'travel')}
          className={`cursor-pointer rounded-3xl p-6 border transition-all ${
            selectedMode === 'random'
              ? 'bg-amber-950/60 border-amber-400 shadow-xl shadow-amber-500/20 scale-102'
              : 'bg-slate-900/80 border-white/10 hover:border-amber-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black uppercase px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
              主题轮换
            </span>
            {selectedMode === 'random' && <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />}
          </div>
          <h2 className="text-xl font-black text-white mb-2">🟡 主题场</h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            随机抽签主题（旅行、学习、工作、生活、文化）。仅限与主题相符的词句结算。
          </p>
          <div className="text-[11px] text-amber-300 font-bold">主题：随机轮换</div>
        </div>

        {/* 3. 防灾专场 (日本·富山市防灾) */}
        <div
          onClick={() => onSelectMode('disaster', 'disaster')}
          className={`cursor-pointer rounded-3xl p-6 border transition-all ${
            selectedMode === 'disaster'
              ? 'bg-red-950/60 border-red-500 shadow-xl shadow-red-500/20 scale-102'
              : 'bg-slate-900/80 border-white/10 hover:border-red-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black uppercase px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
              防灾专项
            </span>
            {selectedMode === 'disaster' && <span className="w-3 h-3 rounded-full bg-red-400 animate-ping" />}
          </div>
          <h2 className="text-xl font-black text-white mb-2">🔴 防灾专场</h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            日本·富山市防灾知识专场。包含地震、津波、避難所、高台避险等专业表达。
          </p>
          <div className="text-[11px] text-red-300 font-bold">主题：地震・津波・避難</div>
        </div>
      </main>

      {/* Bottom Panel: Player Profile & Start Match */}
      <footer className="w-full max-w-4xl bg-slate-900/90 border border-white/10 rounded-3xl p-6 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 z-20">
        {/* Nickname & Color Customization */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="space-y-1 flex-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">你的昵称</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleNameBlur}
              className="w-full md:w-48 bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">侍蛇颜色</label>
            <div className="flex gap-1.5">
              {PLAYER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => handleColorSelect(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
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
            <div className="text-[10px] text-slate-400 font-bold uppercase">倒计时</div>
            <div className="text-xl font-mono font-black text-cyan-400">{secondsLeft}s</div>
          </div>

          <button
            onClick={onStart}
            className="w-full sm:w-auto px-8 py-4 bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-black text-lg rounded-2xl shadow-xl shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5 fill-current" /> 开启 120 秒比赛
          </button>
        </div>
      </footer>

      {/* QR Code Invitation Modal */}
      {showQRCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-8 max-w-sm w-full text-center space-y-5 shadow-2xl relative">
            <button
              onClick={() => setShowQRCodeModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800"
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
              <p className="text-xs text-slate-400">手机扫码或浏览器输入网址加入游戏：</p>
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
              onClick={() => setShowQRCodeModal(false)}
              className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LobbyScreen;
