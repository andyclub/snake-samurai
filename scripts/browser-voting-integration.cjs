// Local mock transports only. Start both current and baseline Vite servers first.
require('node:fs').mkdirSync('output/playwright',{recursive:true});
const assert = require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE=Date.now();
function snapshot(game, phase='PLAYING') {
 if(game==='ransen')return {phase,startedAt:BASE,slimes:[0,1].map(i=>({id:'unit'+i,x:300+i*1000,y:300,targetX:300+i*1000,targetY:300,size:30,color:'#123456',members:[{id:i===0?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222',name:'Mock'+i,color:'#123456',isBot:false}],isDead:false,memberTargets:{}})),encounters:[]};
 return {id:'snake-free',phase,mode:'free',theme:'free',startedAt:BASE,endsAt:BASE+120000,bounds:{minX:-1600,maxX:1600,minY:-900,maxY:900},snakes:Object.fromEntries([0,1].map(i=>['unit'+i,{id:'unit'+i,playerId:'human'+i,nickname:'Mock'+i,baseColor:'#123456',head:{x:i*700,y:0},direction:{x:1,y:0},target:{x:100+i*700,y:0},bodyPath:Array.from({length:9},(_,n)=>({x:i*700-n*14,y:0})),bodySegments:[],baseLength:0,earnedLength:0,totalLength:0,currentSpeed:180,heldFoods:[],buildState:{status:'INVALID',candidates:[],sentenceCandidates:[],version:1},completionHistory:[],isBot:false,connected:true}])),foods:{},leaderboard:[],version:1};
}
function decode(raw){
 if(typeof raw==='string')return JSON.parse(raw);
 const b=Buffer.from(raw);let o=7;const f=[];for(let i=1;i<=5;i++){f.push(b.subarray(o,o+b[i]).toString());o+=b[i];}return[f[0],f[1],f[2],'broadcast',{event:f[3],payload:JSON.parse(b.subarray(o).toString())}];
}
async function scenario(browser,game,port,version,initialPhase,duration){
 const counts={GET:0,POST:0,PUT:0};const events={};const byClient=[{GET:0,POST:0,PUT:0},{GET:0,POST:0,PUT:0}];const contexts=[],pages=[],sockets=[];const errors=[];let stored=snapshot(game,initialPhase),phase=initialPhase;let drop=false;let held=[];
 const send=(s,ev,payload,ref=null)=>{if(!s.active)return;s.ws.send(JSON.stringify([s.join,ref,s.topic,ev,payload]));};
 const presence=()=>{const state={};for(const s of sockets.filter(s=>s.active&&s.meta)){(state[s.key]||={metas:[]}).metas.push({...s.meta,phx_ref:'ref'+s.index});}for(const s of sockets.filter(s=>s.active&&s.topic))send(s,'presence_state',state);};
 function deliver(sender,payload){for(const s of sockets.filter(s=>s.active&&s!==sender)){if(drop){held.push([s,payload]);continue;}send(s,'broadcast',payload);}}
 async function createClient(i){
 byClient[i]||={GET:0,POST:0,PUT:0};
 const c=await browser.newContext();contexts.push(c);
 await c.route('**/*',async route=>{
 const req=route.request(),url=req.url();if(url.startsWith(`http://127.0.0.1:${port}/`))return route.continue();if(url.startsWith('https://cdn.tailwindcss.com'))return route.fulfill({path:process.env.TAILWIND_FIXTURE || 'output/playwright/tailwind-runtime.js',contentType:'application/javascript'});if(!url.includes('.supabase.co/'))return route.abort();
 if(!url.includes('/functions/'))return route.fulfill({json:[]});
 counts[req.method()]++;byClient[i][req.method()]++;const body=req.postDataJSON();
 if(initialPhase==='LOBBY'&&phase==='LOBBY'&&await req.frame().evaluate(()=>Date.now())>=BASE+30000){stored=snapshot(game);stored.startedAt=BASE+30000;if(game==='snake')stored.endsAt=BASE+150000;phase='PLAYING';}
 if(req.method()==='PUT'&&body?.snapshot){stored=body.snapshot;phase=body.phase||body.snapshot.phase;}
 if(body?.command==='claim_start'){stored=body.snapshot;phase='PLAYING';}
 return route.fulfill({json:{ok:true,persisted:true,phase,lobbyEndsAt:initialPhase==='LOBBY'?new Date(BASE+30000).toISOString():null,arenaName:'Mock',directorStatus:'primary',snapshot:stored}});
 });
 await c.routeWebSocket('**/*',ws=>{
 if(!ws.url().includes('.supabase.co/')){if(ws.url().startsWith(`ws://127.0.0.1:${port}/`))ws.connectToServer();else ws.close();return;}
 const s={ws,index:i,active:true,meta:null,topic:null,join:null,key:null};sockets.push(s);
 ws.onClose(()=>{s.active=false;presence();});
 ws.onMessage(raw=>{const [join,ref,topic,event,payload]=decode(raw);
 if(event==='heartbeat'){ws.send(JSON.stringify([null,ref,topic,'phx_reply',{status:'ok',response:{}}]));return;}
 if(event==='phx_join'){s.join=join;s.topic=topic;s.key=payload.config?.presence?.key;send(s,'phx_reply',{status:'ok',response:{}},ref);presence();}
 else if(event==='presence'){s.meta=payload.payload;send(s,'phx_reply',{status:'ok',response:{}},ref);presence();}
 else if(event==='broadcast'){events[payload.event]=(events[payload.event]||0)+1;send(s,'phx_reply',{status:'ok',response:{}},ref);deliver(s,payload);}
 else if(event==='phx_leave'){send(s,'phx_reply',{status:'ok',response:{}},ref);s.active=false;presence();}
 else send(s,'phx_reply',{status:'ok',response:{}},ref);
 });
 });
 await c.addInitScript(index=>{localStorage.setItem('kazeabc_device_id',index===0?'11111111-1111-4111-8111-111111111111':index===1?'22222222-2222-4222-8222-222222222222':'33333333-3333-4333-8333-333333333333');localStorage.setItem('kazeabc_name','Tester'+index);},i);
 const p=await c.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:BASE});await p.goto(`http://127.0.0.1:${port}/`);await p.waitForTimeout(200);return p;
 }
 for(let i=0;i<2;i++)await createClient(i);
 async function advance(ms,step=200){for(let n=0;n<ms;n+=step){await Promise.all(pages.filter(p=>!p.isClosed()).map(p=>p.clock.runFor(Math.min(step,ms-n))));await new Promise(r=>setTimeout(r,1));}}
 await advance(2000);const before=structuredClone({counts,events,byClient});
 if(initialPhase==='OFF'){await Promise.all(pages.map(p=>p.clock.runFor(duration)));await pages[0].waitForTimeout(200);}
 else await advance(duration);
 const after=structuredClone({counts,events,byClient});const extra={};
 if(initialPhase==='PLAYING'){
  drop=true;
  const now=await pages[0].evaluate(()=>Date.now());
  const encounter={id:'short-vote',slime1Id:'unit0',slime2Id:'unit1',startTime:now,question:{id:'mock-q',text:'RECOVERY_TEST_QUESTION',options:['RecoveryAnswerA','RecoveryAnswerB','RecoveryAnswerC','RecoveryAnswerD'],correctIndex:0,type:'grammar'},votes1:{},votes2:{},participants1:stored.slimes[0].members,participants2:stored.slimes[1].members,resolved:false};
  const battleHost=sockets.find(s=>s.active&&s.index===0&&s.meta);assert.ok(battleHost,'deterministic first client is host');
  send(battleHost,'broadcast',{event:'state',payload:{...stored,phase:'PLAYING',encounters:[encounter],serverNow:now}});
  const recoveryBefore=structuredClone(counts);await advance(2400);
  assert.ok((await pages[1].locator('body').innerText()).includes('RECOVERY_TEST_QUESTION'),'remote recovers lost battle before 20s vote deadline');
  await pages[1].getByRole('button',{name:/RecoveryAnswerA/}).click();drop=false;
  // Deliver the vote to the host while all state packets have been lost.
  for(const [target,payload] of held.splice(0).filter(([,p])=>p.event==='vote'))send(target,'broadcast',payload);
  await advance(500);assert.equal(stored.encounters.find(e=>e.id==='short-vote')?.votes2?.['22222222-2222-4222-8222-222222222222'],0,'vote reached authoritative host persistence');
  extra.voting={recoveryBefore,after:structuredClone(counts),recoveryBoundMs:2400,votePersisted:true};
  const packets=held.splice(0);for(const [target,payload] of packets.reverse().slice(0,8))send(target,'broadcast',payload);await advance(500);
  extra.reorderedPackets=packets.length;
  // Force a real browser WebSocket close; automatic channel rejoin uses the same mock.
  const reconnectBefore=structuredClone({counts,events});for(const socket of sockets.filter(s=>s.active&&s.index===1)){socket.active=false;socket.ws.close({code:1006});}presence();await advance(6000);extra.reconnect={before:reconnectBefore,after:structuredClone({counts,events}),activeSockets:sockets.filter(s=>s.active&&s.meta).length};
  // Background both: query traffic should pause, but physics/persistence still serve live viewers.
  for(const p of pages)await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  const hiddenBefore=structuredClone(counts);await advance(3000);extra.hidden={before:hiddenBefore,after:structuredClone(counts)};
  for(const p of pages)await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'));});await advance(1000);
  // Close whichever socket was elected lowest key; remaining Presence elects another host.
  const host=sockets.filter(s=>s.active&&s.meta).sort((a,b)=>a.key.localeCompare(b.key))[0];const hostBefore=structuredClone({counts,events});await contexts[host.index].close();for(const s of sockets.filter(s=>s.index===host.index))s.active=false;presence();await advance(4000);extra.hostDeparture={oldHost:host.index,before:hostBefore,after:structuredClone({counts,events})};
  // The surviving host runs the actual round deadline and persists its terminal state.
  const endBefore=structuredClone({counts,events});await advance(game==='ransen'?310000:130000,1000);extra.naturalEnd={before:endBefore,after:structuredClone({counts,events}),persistedPhase:phase};
  assert.equal(phase,'THEATER',`${game} actual deadline persisted settlement`);
  const returning=await createClient(2);await returning.clock.runFor(1000);await returning.waitForTimeout(200);
  extra.returningText=await returning.locator('body').innerText();extra.finalPhase=phase;extra.visibleText=await pages.find(p=>!p.isClosed()).locator('body').innerText();

 }
 assert.deepEqual(errors,[],`${version} ${game} runtime errors`);
 if(initialPhase==='LOBBY')assert.equal(phase,'PLAYING',`${game} dated lobby transitioned`);
 const result={game,version,initialPhase,duration,before,after,extra,errors,tracked:sockets.filter(s=>s.meta).map(s=>({client:s.index,role:s.meta.role,spectator:s.meta.player?.isSpectator}))};
 for(const c of contexts)await c.close();return result;
}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{const results=[];for(const [game,b,a] of [['ransen',4181,4171]])for(const [version,port]of(process.env.SYNC_TEST_SCOPE==='changed'?[['changed',a]]:[['baseline',b],['changed',a]])){for(const [phase,ms]of[['PLAYING',10000]]){results.push(await scenario(browser,game,port,version,phase,ms));console.log(JSON.stringify(results.at(-1)));}}require('node:fs').writeFileSync('output/playwright/voting-integration-results.json',JSON.stringify(results,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
