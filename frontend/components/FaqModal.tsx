import React from 'react';
import { X, MousePointer2, Swords, Vote, Trophy } from 'lucide-react';
import { Language } from '../types';
import SlimeAvatar from './SlimeAvatar';
import HomeLink from './HomeLink';

const icons = [MousePointer2, Swords, Vote, Trophy];
const colors = ['#38bdf8', '#fb7185', '#a78bfa', '#fbbf24'];
const copy: Record<Language, { eyebrow: string; title: string; intro: string; cards: [string,string][]; boundaryTitle: string; boundary: string; close: string }> = {
  'zh-CN': { eyebrow:'游戏玩法', title:'史莱姆生存指南', intro:'一场把日语、团队判断和走位揉在一起的大乱斗。', cards:[['点哪里，就冲哪里','成员点击方向会合成移动方向；同向人数就是速度倍率。机器人只提供加速，不参与方向合成。'],['撞上就开战','两只史莱姆接触会触发日语问答。多组史莱姆可以同时对战，每组都有独立题目与倒计时。'],['全队公开投票','同一只史莱姆内的每个成员都会显示自己的选项，并以队内多数票决定答案。'],['答对、分裂、吞噬','正确答案优先获胜；结果相同时由实力决胜。单人败方会被吞噬，多人败方会均分裂成两只史莱姆。']], boundaryTitle:'边界规则：', boundary:'安全区每30秒缩小为当前尺寸的70%，最低保留20%。触碰边缘会被强制弹回并播放限制提示音。', close:'关闭玩法说明' },
  'zh-TW': { eyebrow:'遊戲玩法', title:'史萊姆生存指南', intro:'一場把日語、團隊判斷和走位揉在一起的大亂鬥。', cards:[['點哪裡，就衝哪裡','成員點擊方向會合成移動方向；同向人數就是速度倍率。機器人只提供加速，不參與方向合成。'],['撞上就開戰','兩隻史萊姆接觸會觸發日語問答。多組史萊姆可同時對戰，每組都有獨立題目與倒數。'],['全隊公開投票','同一隻史萊姆內每位成員的選項都會顯示，並以隊內多數票決定答案。'],['答對、分裂、吞噬','正確答案優先獲勝；結果相同時由實力決勝。單人敗方會被吞噬，多人敗方會平均分裂成兩隻史萊姆。']], boundaryTitle:'邊界規則：', boundary:'安全區每30秒縮小為目前尺寸的70%，最低保留20%。觸碰邊緣會被強制彈回並播放限制提示音。', close:'關閉玩法說明' },
  'ja': { eyebrow:'遊び方', title:'スライム生存ガイド', intro:'日本語・チーム判断・位置取りが一つになった大乱戦です。', cards:[['タップした場所へ進もう','全員のタップ方向を合成し、同じ方向の人数が速度倍率になります。Botは方向を決めず加速だけします。'],['ぶつかったらバトル開始','スライム同士が接触すると日本語クイズが始まります。複数の対戦が同時に発生し、それぞれ別の問題と制限時間があります。'],['チーム全員で投票','同じスライムの各メンバーの回答がパネルに表示され、多数決で答えが決まります。'],['正解・分裂・吸収','正解したチームが優先して勝利します。敗者が1人なら吸収され、複数人ならほぼ半分ずつの2体に分裂します。']], boundaryTitle:'境界ルール：', boundary:'安全エリアは30秒ごとに現在の70%へ縮小し、最小20%です。境界に触れると押し戻され、警告音が鳴ります。', close:'遊び方を閉じる' },
  'en': { eyebrow:'HOW TO PLAY', title:'Slime Survival Guide', intro:'A frantic mix of Japanese quizzes, team decisions, and arena movement.', cards:[['Tap it, chase it','Member directions combine; the number agreeing with the heading becomes its speed multiplier. Bots accelerate but do not vote on direction.'],['Collide to battle','When two slimes touch, a Japanese quiz begins. Several battles can run at once, each with its own question and timer.'],['Vote as a team','Every member of the same slime has their choice shown on the team panel, and the majority decides the answer.'],['Answer, split, devour','Correct answers win first. A one-player loser is devoured; a multi-player loser splits as evenly as possible into two slimes.']], boundaryTitle:'Boundary rule:', boundary:'Every 30 seconds the safe zone shrinks to 70% of its current size, down to 20%. Its edge forces slimes back with a warning sound.', close:'Close instructions' },
  'ko': { eyebrow:'게임 방법', title:'슬라임 생존 가이드', intro:'일본어 퀴즈, 팀 판단, 이동 전략이 합쳐진 대난투입니다.', cards:[['누른 곳으로 돌진','팀원 방향을 합성하고 같은 방향 인원이 속도 배수가 됩니다. 봇은 방향 투표 없이 가속만 제공합니다.'],['부딪히면 전투 시작','슬라임끼리 닿으면 일본어 퀴즈가 시작됩니다. 여러 전투가 동시에 진행되며 각 전투마다 문제와 제한 시간이 있습니다.'],['팀원 모두 투표','같은 슬라임의 모든 팀원 선택이 패널에 표시되고 다수결로 답을 결정합니다.'],['정답, 분열, 흡수','정답 팀이 우선 승리합니다. 패자가 1명이면 흡수되고 여러 명이면 최대한 균등한 두 슬라임으로 분열합니다.']], boundaryTitle:'경계 규칙:', boundary:'안전 구역은 30초마다 현재 크기의 70%로 줄어들며 최소 20%입니다. 경계에 닿으면 밀려나고 경고음이 납니다.', close:'게임 방법 닫기' },
  'fr': { eyebrow:'COMMENT JOUER', title:'Guide de survie du slime', intro:'Un mélange explosif de quiz japonais, de décisions d’équipe et de placement.', cards:[['Touchez pour foncer','Les directions se combinent et les joueurs d’accord fixent le multiplicateur. Les bots accélèrent sans voter sur la direction.'],['Une collision lance le combat','Quand deux slimes se touchent, un quiz de japonais commence. Plusieurs combats peuvent avoir lieu avec leurs propres questions et chronos.'],['Votez en équipe','Le choix de chaque membre du même slime apparaît sur le panneau et la majorité décide de la réponse.'],['Répondez, divisez, dévorez','Une bonne réponse est prioritaire. Un perdant seul est dévoré ; une équipe perdante se divise au plus juste en deux slimes.']], boundaryTitle:'Règle de limite :', boundary:'Toutes les 30 secondes, la zone passe à 70% de sa taille actuelle, avec un minimum de 20%. Le bord repousse les slimes avec un avertissement.', close:'Fermer les règles' },
  'nl': { eyebrow:'SPELREGELS', title:'Slime-overlevingsgids', intro:'Een wilde mix van Japanse quizzen, teambeslissingen en slimme positionering.', cards:[['Tik en ga','Richtingen worden gecombineerd; het aantal medestanders bepaalt de snelheidsfactor. Bots versnellen zonder richting te stemmen.'],['Bots om te vechten','Wanneer twee slimes elkaar raken, start een Japanse quiz. Meerdere gevechten kunnen tegelijk lopen met een eigen vraag en timer.'],['Stem als team','De keuze van elk lid van dezelfde slime verschijnt op het teampaneel; de meerderheid bepaalt het antwoord.'],['Antwoord, splits, verslind','Een goed antwoord wint eerst. Een eenpersoons verliezer wordt verslonden; een team splitst zo gelijk mogelijk in twee slimes.']], boundaryTitle:'Grensregel:', boundary:'Elke 30 seconden krimpt de veilige zone tot 70% van de huidige grootte, met een minimum van 20%. De rand duwt slimes terug met een waarschuwing.', close:'Spelregels sluiten' },
};

const smoothBoundary: Record<Language, string> = {
  'zh-CN': '安全区会在整场5分钟内从100%连续平滑缩小到20%。触碰边缘会被强制弹回并播放限制提示音。',
  'zh-TW': '安全區會在整場5分鐘內從100%連續平滑縮小到20%。觸碰邊緣會被強制彈回並播放限制提示音。',
  'ja': '安全エリアは試合の5分間を通して100%から20%まで滑らかに縮小します。境界に触れると押し戻され、警告音が鳴ります。',
  'en': 'Over the full five-minute match, the safe zone shrinks smoothly from 100% to 20%. Its edge pushes slimes back with a warning sound.',
  'ko': '안전 구역은 5분 경기 동안 100%에서 20%까지 부드럽게 줄어듭니다. 경계에 닿으면 밀려나고 경고음이 납니다.',
  'fr': 'Pendant les cinq minutes du match, la zone diminue progressivement de 100% à 20%. Le bord repousse les slimes avec un avertissement.',
  'nl': 'Tijdens de wedstrijd van vijf minuten krimpt de veilige zone vloeiend van 100% naar 20%. De rand duwt slimes terug met een waarschuwing.',
};

const battleAnimationCopy: Record<Language, { title: string; devour: string; devourHint: string; split: string; splitHint: string; winner: string; solo: string; team: string }> = {
  'zh-CN': { title: '战斗结果动画', devour: '单人败方被吞噬', devourHint: '败方只有 1 人时，胜方将其吞噬并变大。', split: '多人败方会分裂', splitHint: '败方有多人时，会分裂成两只较小的史莱姆。', winner: '胜方', solo: '单人败方', team: '多人败方' },
  'zh-TW': { title: '戰鬥結果動畫', devour: '單人敗方被吞噬', devourHint: '敗方只有 1 人時，勝方會將其吞噬並變大。', split: '多人敗方會分裂', splitHint: '敗方有多人時，會分裂成兩隻較小的史萊姆。', winner: '勝方', solo: '單人敗方', team: '多人敗方' },
  'ja': { title: 'バトル結果アニメーション', devour: '1人の敗者は吸収', devourHint: '敗者が1人なら、勝者に吸収されて勝者が大きくなります。', split: '複数人の敗者は分裂', splitHint: '敗者が複数人なら、2体の小さなスライムに分裂します。', winner: '勝者', solo: '1人の敗者', team: '複数人の敗者' },
  'en': { title: 'Battle result animation', devour: 'A solo loser is devoured', devourHint: 'When the losing slime has one member, the winner devours it and grows.', split: 'A team loser splits', splitHint: 'When the losing slime has several members, it splits into two smaller slimes.', winner: 'Winner', solo: 'Solo loser', team: 'Team loser' },
  'ko': { title: '전투 결과 애니메이션', devour: '1인 패자는 흡수', devourHint: '패자가 한 명이면 승자가 흡수하고 더 커집니다.', split: '여러 명의 패자는 분열', splitHint: '패자가 여러 명이면 더 작은 슬라임 두 개로 분열합니다.', winner: '승자', solo: '1인 패자', team: '팀 패자' },
  'fr': { title: 'Animation du résultat', devour: 'Un perdant seul est absorbé', devourHint: 'Si le slime perdant n’a qu’un membre, le vainqueur l’absorbe et grandit.', split: 'Une équipe perdante se divise', splitHint: 'Avec plusieurs membres, le perdant se divise en deux slimes plus petits.', winner: 'Vainqueur', solo: 'Perdant seul', team: 'Équipe perdante' },
  'nl': { title: 'Animatie van het resultaat', devour: 'Een solo-verliezer wordt opgeslokt', devourHint: 'Heeft de verliezer één lid, dan slokt de winnaar hem op en groeit.', split: 'Een team-verliezer splitst', splitHint: 'Met meerdere leden splitst de verliezer in twee kleinere slimes.', winner: 'Winnaar', solo: 'Solo-verliezer', team: 'Team-verliezer' },
};

const FaqModal: React.FC<{onClose:()=>void; lang: Language}> = ({onClose, lang}) => {
  const text = { ...copy[lang], boundary: smoothBoundary[lang] };
  const animationText = battleAnimationCopy[lang];
  return <div className="fixed inset-0 z-[120] bg-[#050816]/95 backdrop-blur-xl overflow-y-auto p-4 sm:p-8">
    <div className="max-w-4xl mx-auto">
      <button onClick={onClose} aria-label={text.close} title={text.close} className="fixed right-4 z-10 p-4 bg-white/15 border border-white/20 rounded-full shadow-xl active:scale-90" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }}><X/></button>
      <div className="text-center mb-8"><SlimeAvatar className="w-36 h-36 mx-auto"/><p className="text-cyan-300 font-black tracking-[.3em] text-xs">{text.eyebrow}</p><h2 className="text-4xl font-black mt-2">{text.title}</h2><p className="text-slate-400 mt-3">{text.intro}</p></div>
      <div className="grid md:grid-cols-2 gap-4">{text.cards.map(([title,body], i) => { const Icon=icons[i]; const color=colors[i]; return <article key={title} className="rounded-3xl border border-white/10 bg-white/[.05] p-6 relative overflow-hidden"><span className="absolute right-4 top-2 text-7xl font-black text-white/[.04]">0{i+1}</span><div className="flex gap-4"><div className="p-3 h-fit rounded-2xl" style={{background:`${color}22`,color}}><Icon/></div><div><h3 className="text-xl font-black mb-2">{title}</h3><p className="text-slate-300 leading-7">{body}</p></div></div></article>})}</div>
      <section className="mt-6 rounded-3xl border border-fuchsia-300/20 bg-fuchsia-400/[.06] p-5 sm:p-6">
        <h3 className="mb-4 text-xl font-black text-fuchsia-100">{animationText.title}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <h4 className="font-black text-amber-200">{animationText.devour}</h4>
            <p className="mt-1 min-h-10 text-sm text-slate-400">{animationText.devourHint}</p>
            <div className="faq-battle-stage mt-3" aria-label={animationText.devour}>
              <div className="faq-devour-winner"><SlimeAvatar color="#22d3ee" className="h-20 w-20"/><span>{animationText.winner}</span></div>
              <div className="faq-devour-loser"><SlimeAvatar color="#fb7185" className="h-14 w-14"/><span>{animationText.solo}</span></div>
              <div className="faq-devour-vortex">🌀</div>
            </div>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <h4 className="font-black text-amber-200">{animationText.split}</h4>
            <p className="mt-1 min-h-10 text-sm text-slate-400">{animationText.splitHint}</p>
            <div className="faq-battle-stage mt-3" aria-label={animationText.split}>
              <div className="faq-split-source"><SlimeAvatar colors={['#a78bfa','#f472b6','#fbbf24']} className="h-20 w-20"/><span>{animationText.team}</span></div>
              <div className="faq-split-piece faq-split-left"><SlimeAvatar color="#a78bfa" className="h-12 w-12"/></div>
              <div className="faq-split-piece faq-split-right"><SlimeAvatar colors={['#f472b6','#fbbf24']} className="h-12 w-12"/></div>
              <div className="faq-split-impact">💥</div>
            </div>
          </article>
        </div>
      </section>
      <div className="mt-6 rounded-3xl bg-amber-400/10 border border-amber-300/20 p-5 text-amber-100"><b>{text.boundaryTitle}</b> {text.boundary}</div>
      <div className="flex justify-center border-t border-white/10 py-8 mt-8">
        <HomeLink />
      </div>
    </div>
    <style>{`
      .faq-battle-stage{position:relative;height:10rem;overflow:hidden;border-radius:1rem;background:radial-gradient(circle at center,rgba(168,85,247,.16),rgba(2,6,23,.72))}
      .faq-battle-stage span{display:block;margin-top:-.4rem;text-align:center;font-size:.68rem;font-weight:800;color:#cbd5e1;white-space:nowrap}
      .faq-devour-winner,.faq-devour-loser,.faq-split-source,.faq-split-piece{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
      .faq-devour-winner{margin-left:-4.2rem;animation:faq-winner-grow 4s ease-in-out infinite}
      .faq-devour-loser{margin-left:4.4rem;animation:faq-loser-devoured 4s ease-in-out infinite}
      .faq-devour-vortex{position:absolute;left:50%;top:48%;font-size:2.2rem;animation:faq-vortex 4s ease-in-out infinite}
      .faq-split-source{animation:faq-split-source 4s ease-in-out infinite}
      .faq-split-piece{opacity:0;animation-duration:4s;animation-timing-function:ease-out;animation-iteration-count:infinite}
      .faq-split-left{animation-name:faq-split-left}.faq-split-right{animation-name:faq-split-right}
      .faq-split-impact{position:absolute;left:50%;top:46%;font-size:2rem;animation:faq-impact 4s ease-out infinite}
      @keyframes faq-winner-grow{0%,30%,100%{transform:translate(-50%,-50%) scale(1)}60%,82%{transform:translate(5%,-50%) scale(1.28)}}
      @keyframes faq-loser-devoured{0%,28%,100%{transform:translate(-50%,-50%) scale(1);opacity:1}62%,82%{transform:translate(-220%,-50%) scale(.05) rotate(540deg);opacity:0}}
      @keyframes faq-vortex{0%,25%,85%,100%{transform:translate(-50%,-50%) scale(.1);opacity:0}42%,68%{transform:translate(-50%,-50%) scale(1) rotate(360deg);opacity:1}}
      @keyframes faq-split-source{0%,35%,100%{transform:translate(-50%,-50%) scale(1);opacity:1}53%,82%{transform:translate(-50%,-50%) scale(1.35);opacity:0}}
      @keyframes faq-split-left{0%,42%,100%{transform:translate(-50%,-50%) scale(.2);opacity:0}58%,82%{transform:translate(-165%,-50%) scale(1);opacity:1}}
      @keyframes faq-split-right{0%,42%,100%{transform:translate(-50%,-50%) scale(.2);opacity:0}58%,82%{transform:translate(65%,-50%) scale(1);opacity:1}}
      @keyframes faq-impact{0%,38%,78%,100%{transform:translate(-50%,-50%) scale(.1);opacity:0}48%{transform:translate(-50%,-50%) scale(1.35);opacity:1}}
      @media (prefers-reduced-motion:reduce){.faq-devour-winner,.faq-devour-loser,.faq-devour-vortex,.faq-split-source,.faq-split-piece,.faq-split-impact{animation:none!important}.faq-devour-loser{opacity:.35}.faq-devour-winner{transform:translate(5%,-50%) scale(1.2)}.faq-split-source{display:none}.faq-split-piece{opacity:1}.faq-split-left{transform:translate(-165%,-50%)}.faq-split-right{transform:translate(65%,-50%)}.faq-split-impact{opacity:1;transform:translate(-50%,-50%)}}
    `}</style>
  </div>;
};
export default FaqModal;
