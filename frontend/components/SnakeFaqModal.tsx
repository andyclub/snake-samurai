import React from 'react';
import { X } from 'lucide-react';
import { Language } from '../types';

const labels: Record<Language, { title:string; bubble:string; bubbleHint:string; self:string; selfHint:string; tail:string; tailHint:string; close:string }> = {
  'zh-CN': { title:'侍蛇操作动画', bubble:'气泡组词', bubbleHint:'衔到完整单词后，点击头顶气泡完成组合。', self:'自行组词', selfHint:'三个以上汉字可点击提示，查找真实且自然的组合。', tail:'踩蛇尾', tailHint:'碰到发亮的蛇尾，嘴里的食材会全部散落。', close:'关闭' },
  'zh-TW': { title:'侍蛇操作動畫', bubble:'氣泡組詞', bubbleHint:'銜到完整單詞後，點擊頭頂氣泡完成組合。', self:'自行組詞', selfHint:'三個以上漢字可點擊提示，查找真實自然的組合。', tail:'踩蛇尾', tailHint:'碰到發亮的蛇尾，嘴裡的食材會全部散落。', close:'關閉' },
  ja: { title:'侍蛇の操作アニメ', bubble:'吹き出しで単語完成', bubbleHint:'単語がそろったら頭上の吹き出しをタップします。', self:'自分で組み合わせる', selfHint:'漢字が3個以上ならヒントをタップして実在表現を確認します。', tail:'しっぽに当たる', tailHint:'光るしっぽに当たると、くわえた食材が散らばります。', close:'閉じる' },
  en: { title:'Snake move guide', bubble:'Bubble compose', bubbleHint:'Tap the bubble above your head when a complete word appears.', self:'Build your own phrase', selfHint:'With three or more kanji, tap the prompt to verify a real expression.', tail:'Hit a tail', tailHint:'Touching a glowing tail spills every held ingredient.', close:'Close' },
  ko: { title:'사무라이 뱀 조작', bubble:'말풍선 단어', bubbleHint:'단어가 완성되면 머리 위 말풍선을 누르세요.', self:'직접 조합', selfHint:'한자가 3개 이상이면 안내를 눌러 실제 표현을 확인합니다.', tail:'꼬리 밟기', tailHint:'빛나는 꼬리에 닿으면 물고 있던 재료가 흩어집니다.', close:'닫기' },
  fr: { title:'Gestes du serpent', bubble:'Composer par bulle', bubbleHint:'Touchez la bulle quand le mot complet apparaît.', self:'Composer librement', selfHint:'Avec trois kanji ou plus, vérifiez une expression réelle.', tail:'Toucher une queue', tailHint:'Une queue lumineuse fait tomber tous les ingrédients.', close:'Fermer' },
  nl: { title:'Slangbewegingen', bubble:'Woordballon', bubbleHint:'Tik op de ballon zodra een volledig woord verschijnt.', self:'Zelf samenstellen', selfHint:'Controleer bij drie of meer kanji of de uitdrukking echt bestaat.', tail:'Staart raken', tailHint:'Een gloeiende staart laat alle ingrediënten vallen.', close:'Sluiten' },
};

const SnakeFaqModal: React.FC<{lang:Language; onClose:()=>void}> = ({lang,onClose}) => {
  const t=labels[lang];
  return <div className="fixed inset-0 z-[150] overflow-y-auto bg-[#050816]/95 p-4 text-white backdrop-blur-xl">
    <div className="mx-auto max-w-4xl py-8"><button onClick={onClose} aria-label={t.close} className="fixed right-5 top-5 z-10 rounded-full border border-white/20 bg-white/10 p-3"><X/></button>
      <h2 className="mb-6 text-center text-3xl font-black">{t.title}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {[[t.bubble,t.bubbleHint,'bubble'],[t.self,t.selfHint,'self'],[t.tail,t.tailHint,'tail']].map(([title,hint,kind])=><article key={kind} className="rounded-3xl border border-white/10 bg-white/[.05] p-5"><h3 className="text-xl font-black text-cyan-200">{title}</h3><p className="mt-2 min-h-14 text-sm text-slate-300">{hint}</p><div className={`snake-faq-stage snake-faq-${kind}`}><span className="snake-faq-head">🐍</span><span className="snake-faq-foods">日 本 語</span><span className="snake-faq-bubble">日本語</span><span className="snake-faq-search">⌕</span><span className="snake-faq-tail">✨</span><span className="snake-faq-spill">日　 本　 語</span></div></article>)}
      </div>
    </div><style>{`
      .snake-faq-stage{position:relative;height:11rem;margin-top:1rem;overflow:hidden;border-radius:1rem;background:radial-gradient(circle,#164e63,#020617 70%)}
      .snake-faq-stage span{position:absolute;font-weight:900}.snake-faq-head{left:12%;top:52%;font-size:2.4rem}.snake-faq-foods{left:34%;top:57%;color:#fde68a}.snake-faq-bubble{left:34%;top:18%;opacity:0;border:2px solid white;border-radius:1rem;background:#22d3ee;color:#082f49;padding:.5rem 1rem}.snake-faq-search{left:54%;top:28%;font-size:2rem;opacity:0}.snake-faq-tail{right:12%;top:57%;font-size:2rem}.snake-faq-spill{left:32%;top:62%;opacity:0;color:#fca5a5}
      .snake-faq-bubble .snake-faq-foods{animation:faq-food-in 4s infinite}.snake-faq-bubble .snake-faq-bubble{animation:faq-bubble 4s infinite}.snake-faq-self .snake-faq-search{animation:faq-search 4s infinite}.snake-faq-self .snake-faq-bubble{animation:faq-bubble 4s 1s infinite}.snake-faq-tail .snake-faq-head{animation:faq-hit 4s infinite}.snake-faq-tail .snake-faq-spill{animation:faq-spill 4s infinite}
      @keyframes faq-food-in{0%,15%{transform:translateX(5rem);opacity:0}35%,100%{transform:none;opacity:1}}@keyframes faq-bubble{0%,38%,100%{opacity:0;transform:scale(.5)}52%,82%{opacity:1;transform:scale(1)}}@keyframes faq-search{0%,25%,85%,100%{opacity:0;transform:rotate(0)}40%,70%{opacity:1;transform:rotate(360deg)}}@keyframes faq-hit{0%,35%,100%{transform:none}55%{transform:translateX(12rem) rotate(20deg)}}@keyframes faq-spill{0%,52%,100%{opacity:0;transform:scale(.3)}65%,88%{opacity:1;transform:translate(-2rem,-2rem) scale(1.2)}}
      @media(prefers-reduced-motion:reduce){.snake-faq-stage span{animation:none!important}.snake-faq-bubble,.snake-faq-search,.snake-faq-spill{opacity:1!important}}
    `}</style></div>;
};
export default SnakeFaqModal;
