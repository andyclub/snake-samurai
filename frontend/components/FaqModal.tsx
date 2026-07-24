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

const FaqModal: React.FC<{onClose:()=>void; lang: Language}> = ({onClose, lang}) => {
  const text = { ...copy[lang], boundary: smoothBoundary[lang] };
  return <div className="fixed inset-0 z-[120] bg-[#050816]/95 backdrop-blur-xl overflow-y-auto p-4 sm:p-8">
    <div className="max-w-4xl mx-auto">
      <button onClick={onClose} aria-label={text.close} title={text.close} className="fixed right-4 z-10 p-4 bg-white/15 border border-white/20 rounded-full shadow-xl active:scale-90" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }}><X/></button>
      <div className="text-center mb-8"><SlimeAvatar className="w-36 h-36 mx-auto"/><p className="text-cyan-300 font-black tracking-[.3em] text-xs">{text.eyebrow}</p><h2 className="text-4xl font-black mt-2">{text.title}</h2><p className="text-slate-400 mt-3">{text.intro}</p></div>
      <div className="grid md:grid-cols-2 gap-4">{text.cards.map(([title,body], i) => { const Icon=icons[i]; const color=colors[i]; return <article key={title} className="rounded-3xl border border-white/10 bg-white/[.05] p-6 relative overflow-hidden"><span className="absolute right-4 top-2 text-7xl font-black text-white/[.04]">0{i+1}</span><div className="flex gap-4"><div className="p-3 h-fit rounded-2xl" style={{background:`${color}22`,color}}><Icon/></div><div><h3 className="text-xl font-black mb-2">{title}</h3><p className="text-slate-300 leading-7">{body}</p></div></div></article>})}</div>
      <div className="mt-6 rounded-3xl bg-amber-400/10 border border-amber-300/20 p-5 text-amber-100"><b>{text.boundaryTitle}</b> {text.boundary}</div>
      <div className="flex justify-center border-t border-white/10 py-8 mt-8">
        <HomeLink />
      </div>
    </div>
  </div>;
};
export default FaqModal;
