import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ArenaBounds, FoodState, HeldFood, Language, SnakeState } from '../types';
import { renderGame } from '../game/snakeRenderer';

const labels: Record<Language, { title:string; bubble:string; bubbleHint:string; self:string; selfHint:string; tail:string; tailHint:string; close:string }> = {
  'zh-CN': { title:'侍蛇操作动画', bubble:'气泡组词', bubbleHint:'衔到完整单词后，点击头顶气泡完成组合。', self:'自行组词', selfHint:'三个以上汉字可点击提示，查找真实且自然的组合。', tail:'踩蛇尾', tailHint:'碰到发亮的蛇尾，嘴里的食材会全部散落。', close:'关闭' },
  'zh-TW': { title:'侍蛇操作動畫', bubble:'氣泡組詞', bubbleHint:'銜到完整單詞後，點擊頭頂氣泡完成組合。', self:'自行組詞', selfHint:'三個以上漢字可點擊提示，查找真實自然的組合。', tail:'踩蛇尾', tailHint:'碰到發亮的蛇尾，嘴裡的食材會全部散落。', close:'關閉' },
  ja: { title:'侍蛇の操作アニメ', bubble:'吹き出しで単語完成', bubbleHint:'単語がそろったら頭上の吹き出しをタップします。', self:'自分で組み合わせる', selfHint:'漢字が3個以上ならヒントをタップして実在表現を確認します。', tail:'しっぽに当たる', tailHint:'光るしっぽに当たると、くわえた食材が散らばります。', close:'閉じる' },
  en: { title:'Snake move guide', bubble:'Bubble compose', bubbleHint:'Tap the bubble above your head when a complete word appears.', self:'Build your own phrase', selfHint:'With three or more kanji, tap the prompt to verify a real expression.', tail:'Hit a tail', tailHint:'Touching a glowing tail spills every held ingredient.', close:'Close' },
  ko: { title:'사무라이 뱀 조작', bubble:'말풍선 단어', bubbleHint:'단어가 완성되면 머리 위 말풍선을 누르세요.', self:'직접 조합', selfHint:'한자가 3개 이상이면 안내를 눌러 실제 표현을 확인합니다.', tail:'꼬리 밟기', tailHint:'빛나는 꼬리에 닿으면 물고 있던 재료가 흩어집니다.', close:'닫기' },
  fr: { title:'Gestes du serpent', bubble:'Composer par bulle', bubbleHint:'Touchez la bulle quand le mot complet apparaît.', self:'Composer librement', selfHint:'Avec trois kanji ou plus, vérifiez une expression réelle.', tail:'Toucher une queue', tailHint:'Une queue lumineuse fait tomber tous les ingrédients.', close:'Fermer' },
  nl: { title:'Slangbewegingen', bubble:'Woordballon', bubbleHint:'Tik op de ballon zodra een volledig woord verschijnt.', self:'Zelf samenstellen', selfHint:'Controleer bij drie of meer kanji of de uitdrukking echt bestaat.', tail:'Staart raken', tailHint:'Een gloeiende staart laat alle ingrediënten vallen.', close:'Sluiten' },
};

type DemoKind = 'bubble' | 'self' | 'tail';
const BOUNDS: ArenaBounds = { minX: -210, maxX: 210, minY: -105, maxY: 105 };
const food = (glyph: string, order: number, x: number, y: number): HeldFood => ({
  foodId: `demo-${glyph}-${order}`, glyph, normalizedGlyph: glyph,
  color: ['#38bdf8', '#f59e0b', '#a78bfa'][order % 3], pickedAt: 0, order, x, y,
});
const snake = (id: string, name: string, color: string, x: number, y: number, directionX = 1): SnakeState => ({
  id, playerId: id, nickname: name || '侍蛇', baseColor: color,
  head: { x, y }, direction: { x: directionX, y: 0 }, target: { x: x + directionX * 40, y },
  bodyPath: Array.from({ length: 9 }, (_, index) => ({ x: x - directionX * index * 14, y })),
  bodySegments: [], baseLength: 9, earnedLength: 0, totalLength: 9, currentSpeed: 180,
  heldFoods: [], buildState: { status: 'INVALID', candidates: [], sentenceCandidates: [], version: 1 },
  completionHistory: [], isBot: false, connected: true,
});

const SnakeDemoCanvas: React.FC<{ kind: DemoKind; color: string; name: string }> = ({ kind, color, name }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const startedAt = performance.now();
    const draw = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = Math.max(240, Math.round(canvas.clientWidth));
      const height = 176;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const progress = ((now - startedAt) % 4_500) / 4_500;
      const snakes: Record<string, SnakeState> = {};
      const foods: Record<string, FoodState> = {};
      if (kind === 'tail') {
        const attackerX = -125 + Math.min(progress / .56, 1) * 145;
        const attacker = snake('demo-player', name, color, attackerX, 28);
        const target = snake('demo-rival', 'ライバル', '#ec4899', 112, 28, -1);
        attacker.heldFoods = progress < .58
          ? ['日', '本', '語'].map((glyph, index) => food(glyph, index, attackerX + 30 + index * 25, 28))
          : [];
        if (progress >= .58) ['日', '本', '語'].forEach((glyph, index) => {
          const id = `spill-${index}`;
          foods[id] = { id, displayedGlyph: glyph, normalizedGlyph: glyph, type: 'kanji', color: ['#38bdf8','#f59e0b','#a78bfa'][index], x: 10 + index * 34, y: -18 - index * 18, collisionRadius: 18, state: 'ground', heldByPlayerId: null };
        });
        snakes[attacker.id] = attacker; snakes[target.id] = target;
      } else {
        const x = -58 + Math.sin(progress * Math.PI * 2) * 8;
        const player = snake('demo-player', name, color, x, 22);
        player.heldFoods = ['日', '本', '語'].map((glyph, index) => food(glyph, index, x + 32 + index * 26, 22));
        snakes[player.id] = player;
      }
      renderGame(ctx, width, height, BOUNDS, snakes, foods, 'demo-player', .82, null, { x: 0, y: 0 });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [kind, color, name]);
  return <div className={`snake-demo-stage snake-demo-${kind}`}>
    <canvas ref={canvasRef} aria-hidden="true" className="h-44 w-full" />
    {kind !== 'tail' && <div className="snake-demo-prompt">{kind === 'bubble' ? '【日本語】' : '⌕ 日本語を確認'}</div>}
    {kind === 'tail' && <div className="snake-demo-impact">💥</div>}
  </div>;
};

interface Props { lang: Language; playerColor: string; playerName: string; onClose: () => void }
const SnakeFaqModal: React.FC<Props> = ({ lang, playerColor, playerName, onClose }) => {
  const t = labels[lang];
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const scrollY = window.scrollY;
    const previous = { overflow: document.documentElement.style.overflow, bodyOverflow: document.body.style.overflow, position: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.documentElement.style.overflow = previous.overflow;
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  return createPortal(<div role="dialog" aria-modal="true" aria-labelledby="snake-faq-title"
    className="fixed inset-0 z-[300] h-[100dvh] w-screen touch-pan-y overflow-hidden overscroll-none bg-[#050816]/98 text-white backdrop-blur-xl">
    <div className="h-full w-full touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain">
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-white/10 bg-[#050816]/95 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-6">
        <h2 id="snake-faq-title" className="min-w-0 text-xl font-black sm:text-2xl">{t.title}</h2>
        <button type="button" onClick={onClose} aria-label={t.close}
          className="touch-manipulation grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/25 bg-slate-800 text-white shadow-xl active:scale-95"><X /></button>
      </header>
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 md:grid-cols-3 sm:px-6">
        {([[t.bubble,t.bubbleHint,'bubble'],[t.self,t.selfHint,'self'],[t.tail,t.tailHint,'tail']] as [string,string,DemoKind][]).map(([title,hint,kind]) =>
          <article key={kind} className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[.05] p-4 sm:p-5">
            <h3 className="text-lg font-black text-cyan-200 sm:text-xl">{title}</h3>
            <p className="mt-2 min-h-12 text-sm leading-relaxed text-slate-300">{hint}</p>
            <SnakeDemoCanvas kind={kind} color={playerColor} name={playerName} />
          </article>)}
      </div>
    </div>
    <style>{`
      .snake-demo-stage{position:relative;margin-top:1rem;height:11rem;overflow:hidden;border-radius:1rem;background:#0f172a;contain:paint}
      .snake-demo-stage canvas{display:block;max-width:100%}
      .snake-demo-prompt{position:absolute;left:50%;top:.65rem;transform:translateX(-50%) scale(.75);white-space:nowrap;border:3px solid #fff;border-radius:1rem;background:#22d3ee;color:#082f49;padding:.45rem .8rem;font-weight:900;opacity:0;animation:snake-demo-prompt 4.5s ease-in-out infinite}
      .snake-demo-self .snake-demo-prompt{background:#fbbf24;color:#1e293b;animation-delay:.45s}
      .snake-demo-impact{position:absolute;left:50%;top:46%;font-size:2.3rem;opacity:0;animation:snake-demo-impact 4.5s ease-out infinite}
      @keyframes snake-demo-prompt{0%,30%,100%{opacity:0;transform:translateX(-50%) scale(.75)}46%,82%{opacity:1;transform:translateX(-50%) scale(1)}}
      @keyframes snake-demo-impact{0%,52%,82%,100%{opacity:0;transform:translate(-50%,-50%) scale(.3)}58%,72%{opacity:1;transform:translate(-50%,-50%) scale(1.25)}}
      @media(prefers-reduced-motion:reduce){.snake-demo-prompt{animation:none;opacity:1;transform:translateX(-50%)}.snake-demo-impact{animation:none;opacity:1;transform:translate(-50%,-50%)}}
    `}</style>
  </div>, document.body);
};
export default SnakeFaqModal;
