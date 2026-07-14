import React, { useState, useEffect } from 'react';
import { Encounter, Player } from '../types';
import { audio } from '../audio';

interface Props {
  t: (key: string) => string;
  encounter: Encounter;
  player: Player;
  onVote: (optionIndex: number) => void;
}

const TriviaModal: React.FC<Props> = ({ t, encounter, player, onVote }) => {
  const [timeLeft, setTimeLeft] = useState(20);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSelect = (index: number) => {
    if (selectedOption !== null) return; // Only vote once
    audio.playPop();
    setSelectedOption(index);
    onVote(index);
  };

  const q = encounter.question;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border-2 border-blue-500 rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-[0_0_30px_rgba(59,130,246,0.3)] transform transition-all scale-100 animate-in zoom-in duration-200">
        
        <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
          <h2 className="text-2xl font-bold text-red-400 flex items-center gap-2">
            ⚔️ {t('trivia.vs')}
          </h2>
          <div className={`text-3xl font-mono font-bold ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
            {timeLeft}s
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-blue-600 text-xs px-2 py-1 rounded uppercase font-bold tracking-wider">
              {q.type}
            </span>
            {q.level && (
              <span className="bg-purple-600 text-xs px-2 py-1 rounded font-bold">
                {q.level}
              </span>
            )}
          </div>
          <p className="text-2xl text-white leading-relaxed">
            {q.text}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {q.options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              disabled={selectedOption !== null}
              className={`
                p-4 rounded-xl text-lg font-medium transition-all duration-200 text-left
                ${selectedOption === idx 
                  ? 'bg-blue-600 text-white ring-2 ring-white shadow-lg' 
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600 hover:scale-[1.02]'}
                ${selectedOption !== null && selectedOption !== idx ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <span className="inline-block w-8 h-8 bg-black/20 rounded-full text-center leading-8 mr-3">
                {['A', 'B', 'C', 'D'][idx]}
              </span>
              {opt}
            </button>
          ))}
        </div>

        {selectedOption !== null && (
          <div className="mt-6 text-center text-slate-400 animate-pulse">
            {t('trivia.waiting')}
          </div>
        )}
      </div>
    </div>
  );
};

export default TriviaModal;
