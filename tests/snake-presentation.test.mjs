import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSnakePresentation,findDisplayPlayerSnake,snakeDisplayWorldPoint} from '../frontend/game/snakePresentation.ts';
const bounds={minX:0,maxX:2000,minY:0,maxY:2000};
const snake=(extra={})=>({id:'snake-p',playerId:'p',nickname:'P',baseColor:'#fff',head:{x:500,y:600},direction:{x:1,y:0},target:{x:500,y:600},
 bodyPath:Array.from({length:9},(_,i)=>({x:500-i*14,y:600})),bodySegments:[],baseLength:1,earnedLength:0,totalLength:1,currentSpeed:180,heldFoods:[],
 buildState:'EMPTY',completionHistory:[],isBot:false,connected:true,...extra});
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
const mount=(s=snake())=>{const p=createSnakePresentation();p.observe({[s.id]:s},bounds,'p',1000);return p;};
test('canonical identity lookup updates after temporary id, presentation resets late actor to authority',()=>{
 const s=snake(),all={[s.id]:s};
 assert.equal(findDisplayPlayerSnake(all,'temporary'),undefined);
 assert.equal(findDisplayPlayerSnake(all,'p'),s);
 const p=createSnakePresentation();p.observe(all,bounds,'temporary',1000);
 p.observe(all,bounds,'p',1200);
 assert.deepEqual(p.frame('p',1200)['snake-p'].head,s.head);
});
test('input immediately moves displayed head/body with no authority, food or earnings mutation',()=>{
 const s=freeze(snake({heldFoods:[{foodId:'f',glyph:'字',normalizedGlyph:'字',color:'#fff',pickedAt:900,order:0,x:520,y:600}]})),all=freeze({[s.id]:s}),before=JSON.stringify(all),p=createSnakePresentation();
 p.observe(all,freeze(bounds),'p',1000);
 assert.equal(p.input('p',{x:1000,y:600},1000),true);
 const displayed=p.frame('p',1016)['snake-p'];
 assert.ok(displayed.head.x>500);
 assert.equal(displayed.bodyPath[0].x,displayed.head.x);
 assert.equal(displayed.heldFoods[0].foodId,'f');
 assert.equal(displayed.earnedLength,0);
 assert.equal(JSON.stringify(all),before);
 for(let i=1;i<displayed.bodyPath.length;i++)assert.ok(Math.abs(Math.hypot(displayed.bodyPath[i].x-displayed.bodyPath[i-1].x,displayed.bodyPath[i].y-displayed.bodyPath[i-1].y)-14)<1e-8);
});
test('150ms buffer caps extrapolation and keeps lost-packet display stopped',()=>{
 const p=mount();p.input('p',{x:1000,y:600},1000);
 assert.equal(p.frame('p',1150)['snake-p'].head.x,527);
 const stopped={...p.frame('p',1150)['snake-p'].head};
 assert.deepEqual(p.frame('p',1500)['snake-p'].head,stopped);
 assert.deepEqual(p.frame('p',5000)['snake-p'].head,stopped);
});
test('other snakes only interpolate known positions with no target extrapolation',()=>{
 const s=snake({id:'other',playerId:'other'}),p=mount(s);
 p.observe({other:snake({...s,head:{x:600,y:600},bodyPath:s.bodyPath.map(point=>({...point,x:point.x+100}))})},bounds,'p',1150);
 assert.equal(p.frame('p',1225).other.head.x,550);
 assert.equal(p.frame('p',1300).other.head.x,600);
 assert.equal(p.frame('p',5000).other.head.x,600);
});
test('authority correction converges and target-only updates preserve immediate turning anchor',()=>{
 const initial=snake(),p=mount(initial);p.input('p',{x:1000,y:600},1000);
 const optimistic={...initial,target:{x:1000,y:600}};
 p.observe({[optimistic.id]:optimistic},bounds,'p',1000);
 assert.equal(p.frame('p',1100)['snake-p'].head.x,518);
 p.input('p',{x:100,y:600},1100);
 p.observe({'snake-p':{...optimistic,target:{x:100,y:600}}},bounds,'p',1100);
 assert.equal(p.frame('p',1100)['snake-p'].head.x,518);
 assert.equal(p.frame('p',1150)['snake-p'].head.x,509);
 const next=snake({head:{x:505,y:600},target:{x:100,y:600}});
 p.observe({'snake-p':next},bounds,'p',1150);
 assert.equal(p.frame('p',1150)['snake-p'].head.x,509);
 assert.ok(p.frame('p',1230)['snake-p'].head.x<505);
});
test('fresh stopped authority, spill, disconnect and remount/reset clear predictions',()=>{
 const p=mount();p.input('p',{x:1000,y:600},1000);
 p.observe({'snake-p':snake({target:{x:1000,y:600}})},bounds,'p',1150);
 assert.equal(p.frame('p',1200)['snake-p'].head.x,500);
 p.reset('snake-p');p.observe({'snake-p':snake({head:{x:550,y:600},heldFoods:[]})},bounds,'p',1300);
 assert.equal(p.frame('p',1300)['snake-p'].head.x,550);
 p.observe({'snake-p':snake({connected:false})},bounds,'p',1400);
 assert.deepEqual(p.frame('p',1450),{});
 p.reset();p.observe({'snake-p':snake({head:{x:300,y:300}})},bounds,'p',1500);
 assert.deepEqual(p.frame('p',1500)['snake-p'].head,{x:300,y:300});
});
test('food collection/length/boundary changes reset display lifecycle and stay metadata-authoritative',()=>{
 const p=mount();p.input('p',{x:1000,y:600},1000);
 const collected=snake({head:{x:510,y:600},heldFoods:[{foodId:'f',glyph:'字',normalizedGlyph:'字',color:'#fff',pickedAt:1000,order:0,x:530,y:600}],earnedLength:1,totalLength:2});
 p.observe({'snake-p':collected},bounds,'p',1100);
 const displayed=p.frame('p',1100)['snake-p'];
 assert.equal(displayed.head.x,510);
 assert.equal(displayed.heldFoods[0].foodId,'f');
 assert.equal(displayed.earnedLength,1);
});
test('camera click maps the actual drawn center and smoothed zoom',()=>{
 const camera={x:456,y:678},zoom=1.1,width=390,height=844;
 assert.deepEqual(snakeDisplayWorldPoint(width/2,height/2,width,height,zoom,camera),camera);
 const point=snakeDisplayWorldPoint(width/2+22,height/2-22,width,height,zoom,camera);
 assert.ok(Math.abs(point.x-476)<1e-8);assert.ok(Math.abs(point.y-658)<1e-8);
});
test('GameBoard RAF reads latest identity/refs and draws presentation without movement helper',()=>{
 const source=readFileSync(new URL('../frontend/components/GameBoard.tsx',import.meta.url),'utf8');
 assert.match(source,/latestPropsRef\.current =/);
 assert.match(source,/findDisplayPlayerSnake\(displayed, latest\.player\.id\)/);
 assert.match(source,/renderGame\([^]*?latest\.boundsRef\.current,\s*displayed,\s*latest\.foodsRef\.current/);
 assert.match(source,/snakeDisplayWorldPoint\([^]*?cameraZoomRef\.current/);
 assert.doesNotMatch(source,/updateSnakePosition|snakesRef\.current\s*=/);
 const pure=readFileSync(new URL('../frontend/game/snakePresentation.ts',import.meta.url),'utf8');
 assert.doesNotMatch(pure,/updateSnakePosition|Math\.random|audio\.|fetch\(|WebSocket|stickingMap/);
});

test('actual mounted Canvas RAF follows identity changed after initial mount',async()=>{
 const {transformSync}=await import('esbuild');
 const vm=await import('node:vm');
 const code=transformSync(readFileSync(new URL('../frontend/components/GameBoard.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs'}).code;
 const slots=[],effects=[],draws=[];
 let cursor=0,raf,time=1000;
 class FakeDate extends Date { static now(){return time;} }
 const react={
  createElement:(type,props,...children)=>({type,props:props||{},children}),
  useRef:value=>{const index=cursor++;return slots[index] ||= {current:value};},
  useState:value=>{const index=cursor++;if(!(index in slots))slots[index]=typeof value==='function'?value():value;return[slots[index],next=>slots[index]=typeof next==='function'?next(slots[index]):next];},
  useEffect:(fn,deps)=>{const index=cursor++,old=slots[index];if(old&&deps&&deps.every((value,j)=>value===old.deps[j]))return;effects.push(()=>{old?.cleanup?.();slots[index]={deps,cleanup:fn()};});},
 };
 const module={exports:{}},noop=()=>{};
 vm.runInNewContext(code,{module,exports:module.exports,Date:FakeDate,console,Math,__REPO_COMMIT_COUNT__:0,__BUILD_DATE__:"test",
  window:{innerWidth:390,innerHeight:844,addEventListener:noop,removeEventListener:noop},
  document:{addEventListener:noop,removeEventListener:noop},
  setInterval:()=>1,clearInterval:noop,setTimeout:()=>1,clearTimeout:noop,
  requestAnimationFrame:callback=>{raf=callback;return 1;},cancelAnimationFrame:noop,
  require:name=>{
   if(name==='react')return react;
   if(name==='../game/snakePresentation')return{createSnakePresentation,findDisplayPlayerSnake,snakeDisplayWorldPoint};
   if(name==='../game/snakeMovement')return{calculateCameraZoom:()=>1.2};
   if(name==='../game/snakeRenderer')return{renderGame:(_ctx,_w,_h,_bounds,snakes,_foods,id,zoom,_click,camera)=>draws.push({snakes,id,zoom,camera})};
   if(name==='../language/trieEngine')return{searchCandidates:()=>({status:'COLLECTING',candidates:[]})};
   if(name==='../language/sentenceEngine')return{analyzeSentenceBuilding:()=>({isSentenceReady:false,candidates:[]})};
   if(name==='../audio')return{audio:{playTailSpill:noop}};
   if(name==='../i18n')return{saveLanguagePreference:noop};
   if(name==='lucide-react')return new Proxy({},{get:()=>noop});
   return noop;
  },
 });
 const canvas={width:390,height:844,getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0})};
 const canonical=snake({head:{x:800,y:700},target:{x:800,y:700},bodyPath:Array.from({length:9},(_,i)=>({x:800-i*14,y:700}))}),snakesRef={current:{[canonical.id]:canonical}};
 const props={player:{id:'temporary',name:'P'},snakesRef,foodsRef:{current:{}},boundsRef:{current:bounds},
  theme:{},mode:'free',timeRemainingSeconds:120,lang:'ja',onSelectLanguage:noop,onPointerTarget:noop,
  onSettleWord:noop,onSettleSentence:noop,onComposeHeldFoods:noop,onSpillTail:noop,tailSpillEffect:null,t:key=>key};
 const render=player=>{
  cursor=0;const tree=module.exports.GameBoard({...props,player});
  const findCanvas=node=>node&&typeof node==='object'&&(node.type==='canvas'?node:(node.children||[]).flat(Infinity).map(findCanvas).find(Boolean));
  findCanvas(tree).props.ref.current=canvas;
  while(effects.length)effects.shift()();
  return findCanvas(tree);
 };
 render(props.player);
 assert.equal(draws.at(-1).id,null);
 const canvasNode=render({id:'p',name:'P'});
 raf();
 assert.equal(draws.at(-1).id,'snake-p');
 assert.equal(draws.at(-1).camera.x,800);
 assert.equal(draws.at(-1).camera.y,700);
 canvasNode.props.onPointerDown({clientX:300,clientY:422,button:0,isPrimary:true,pointerType:'mouse',preventDefault:noop});
 time=1016;raf();
 assert.ok(draws.at(-1).snakes['snake-p'].head.x>800);
 assert.equal(snakesRef.current['snake-p'].head.x,800);
 for(const slot of slots)slot?.cleanup?.();
});

test('200ms authority cadence adapts local prediction without a 150ms freeze; remote interpolation remains 150ms',()=>{
 const p=mount(snake({target:{x:1000,y:600}}));
 p.observe({'snake-p':snake({head:{x:536,y:600},target:{x:1000,y:600}})},bounds,'p',1200);
 const positions=[1340,1350,1360,1380,1399].map(t=>p.frame('p',t)['snake-p'].head.x);
 for(let i=1;i<positions.length;i++)assert.ok(positions[i]>positions[i-1]);
 assert.deepEqual(p.frame('p',1450)['snake-p'].head,p.frame('p',9000)['snake-p'].head);
 // A very late sample cannot expand the stale horizon beyond 300ms.
 p.observe({'snake-p':snake({head:{x:600,y:600},target:{x:1000,y:600}})},bounds,'p',2000);
 assert.deepEqual(p.frame('p',2300)['snake-p'].head,p.frame('p',9000)['snake-p'].head);
});

test('in-flight authority motion with old target preserves the latest unconfirmed turn',()=>{
 const initial=snake({target:{x:1000,y:600}}),p=mount(initial),before=JSON.stringify(initial);
 p.input('p',{x:100,y:600},1100);
 p.observe({'snake-p':{...initial,target:{x:100,y:600}}},bounds,'p',1100);
 p.observe({'snake-p':snake({head:{x:520,y:600},target:{x:1000,y:600}})},bounds,'p',1120);
 const at120=p.frame('p',1120)['snake-p'].head.x,at160=p.frame('p',1160)['snake-p'].head.x,at200=p.frame('p',1200)['snake-p'].head.x;
 assert.ok(at160<at120);assert.ok(at200<at160);
 assert.equal(JSON.stringify(initial),before);
});

test('newest target acknowledgment and a stationary authority sample immediately stop collision prediction',()=>{
 const initial=snake({target:{x:1000,y:600}}),p=mount(initial);
 p.input('p',{x:100,y:600},1050);
 // Acknowledgment may change target while the authoritative head is stationary.
 const confirmed=snake({target:{x:100,y:600}});
 p.observe({'snake-p':confirmed},bounds,'p',1100);
 assert.equal(p.frame('p',1100)['snake-p'].head.x,500);
 assert.equal(p.frame('p',1250)['snake-p'].head.x,500);
 // Confirmed input has been cleared: a later authority target owns the pose.
 p.observe({'snake-p':snake({head:{x:510,y:600},target:{x:1000,y:600}})},bounds,'p',1300);
 assert.equal(p.frame('p',1350)['snake-p'].direction.x,1);
});

test('unconfirmed input expires after 500ms even with fresh old-target authority samples',()=>{
 const p=mount(snake({target:{x:1000,y:600}}));
 p.input('p',{x:100,y:600},1050);
 for(const time of [1200,1400])p.observe({'snake-p':snake({head:{x:500+(time-1000)*.18,y:600},target:{x:1000,y:600}})},bounds,'p',time);
 assert.equal(p.frame('p',1549)['snake-p'].direction.x,-1);
 assert.equal(p.frame('p',1550)['snake-p'].direction.x,1);
 p.observe({'snake-p':snake({connected:false})},bounds,'p',1560);
 assert.deepEqual(p.frame('p',1600),{});
 assert.equal(p.input('p',{x:1000,y:600},1600),false);
});

test('continuous pointer and local target-only feedback cannot renew the authority stale deadline',()=>{
 const initial=snake({target:{x:1000,y:600}}),p=mount(initial);
 let source=initial;
 for(let time=1020;time<=1800;time+=20){
  const target={x:1000,y:600};
  p.input('p',target,time);
  source={...source,target}; // App's optimistic target keeps head/body references.
  p.observe({'snake-p':source},bounds,'p',time);
 }
 assert.equal(p.input('p',{x:1800,y:600},1800),false);
 assert.ok(Math.abs(p.frame('p',1800)['snake-p'].head.x-527)<1e-8);
 assert.deepEqual(p.frame('p',1800)['snake-p'].head,p.frame('p',9000)['snake-p'].head);
});

test('acknowledging an earlier input cannot clear a later target',()=>{
 const p=mount(snake({target:{x:1000,y:600}}));
 p.input('p',{x:100,y:600},1050);
 p.input('p',{x:1200,y:600},1080);
 p.observe({'snake-p':snake({head:{x:505,y:600},target:{x:100,y:600}})},bounds,'p',1100);
 assert.equal(p.frame('p',1110)['snake-p'].direction.x,1);
 p.observe({'snake-p':snake({head:{x:505,y:600},target:{x:1200,y:600}})},bounds,'p',1150);
 assert.equal(p.frame('p',1200)['snake-p'].head.x,505);
});

test('near targets do not overshoot or reverse at 200-300ms horizons and remain frozen when stale',()=>{
 for(const interval of [200,300]){
  const target={x:520,y:600},initial=snake({head:{x:480,y:600},target}),p=mount(initial);
  const sampleAt=1000+interval;
  p.observe({'snake-p':snake({head:{x:500,y:600},target})},bounds,'p',sampleAt);
  const xs=[0,40,80,120,160,200,250,300].map(elapsed=>p.frame('p',sampleAt+elapsed)['snake-p'].head.x);
  for(let i=0;i<xs.length;i++){
   assert.ok(xs[i]<=520+1e-8, 'display head must not pass the nearby target');
   if(i)assert.ok(xs[i]>=xs[i-1]-1e-8, 'display movement must not reverse near the target');
  }
  assert.equal(xs.at(-1),520);
  const frozen={...p.frame('p',sampleAt+300)['snake-p'].head};
  assert.equal(p.input('p',{x:400,y:600},sampleAt+400),false);
  assert.deepEqual(p.frame('p',sampleAt+1000)['snake-p'].head,frozen);
 }
});
