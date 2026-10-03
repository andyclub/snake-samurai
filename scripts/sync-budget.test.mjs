import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const snake = readFileSync(new URL('../package.json', import.meta.url), 'utf8').includes('snake-samurai');
const source = file => readFileSync(new URL(`../frontend/${file}`, import.meta.url), 'utf8');
const app = source('App.tsx');
const hook = source(snake ? 'useSnakeSamuraiMultiplayer.ts' : 'useRansenMultiplayer.ts');
// Execute the actual production effect bodies with isolated timers and transport.
function effect(text, marker, globals) {
  const markerAt = text.indexOf(marker);
  assert.ok(markerAt >= 0, marker);
  const start = text.lastIndexOf('useEffect(() => {', markerAt);
  const end = text.indexOf('\n  }, [', markerAt);
  const body = text.slice(start + 'useEffect(() => {'.length, end);
  const js = `(() => {${body.replaceAll(': Encounter', '').replaceAll(' as ArenaState', '')}\n})();`;
  return vm.runInNewContext(js, globals);
}
function fixture(phase = 'LOBBY', deadline = 1000) {
  let calls = 0;
  const intervals = new Map(); const listeners = new Map();
  const window = { location: { pathname: '/' }, setInterval: (fn, ms) => {intervals.set(fn, ms); return fn;}, clearInterval: fn => intervals.delete(fn), setTimeout: fn => fn, clearTimeout: () => {}, addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) };
  const document = { visibilityState: 'visible', addEventListener: window.addEventListener, removeEventListener: window.removeEventListener };
  const globals = { window, document, console, GamePhase: { LOBBY:'LOBBY', OFF:'OFF', PLAYING:'PLAYING', THEATER:'THEATER' }, phase, registrationActive:phase==='LOBBY'&&Boolean(deadline), lobbyEndsAt: deadline, phaseRef: { current:phase }, connection:'online', userId:'a', player:{ id:'a' }, roomId:'main', callbacks:{current:{getSnapshot:()=>({phase:globals.phaseRef.current}),onCommand:()=>{}}}, registerRansenPlayer: async()=>{calls++;return {ok:true,phase};}, registerSnakeSamuraiPlayer: async()=>{calls++;return {ok:true};}, setRegistrationError:()=>{} };
  return { globals, intervals, listeners, calls:()=>calls };
}
const flush = async()=>{ for(let i=0;i<8;i++)await Promise.resolve(); };
for (const phase of ['OFF','PLAYING','THEATER']) test(`no registration in ${phase}`, async()=>{
 const f=fixture(phase);effect(hook, snake ? 'const heartbeat = async' : 'const register = async',f.globals); await flush(); assert.equal(f.calls(),0); assert.equal(f.intervals.size,0);
});
test('no repeating registration in undated idle lobby',async()=>{
 const f=fixture('LOBBY',null);effect(hook,snake?'const heartbeat = async':'const register = async',f.globals);await flush();assert.equal(f.calls(),0);assert.equal(f.intervals.size,0);
});
test('lobby renewal, transition guard and cleanup',async()=>{
 const f=fixture();const cleanup=effect(hook,snake?'const heartbeat = async':'const register = async',f.globals);await flush();assert.equal(f.calls(),1);assert.deepEqual([...f.intervals.values()],[5000]);
 const timer=[...f.intervals.keys()][0];await timer();assert.equal(f.calls(),2);f.globals.phaseRef.current='PLAYING';await timer();assert.equal(f.calls(),2);cleanup();assert.equal(f.intervals.size,0);await timer();assert.equal(f.calls(),2);
});
test('slow registration never overlaps',async()=>{
 const f=fixture();let release;f.globals[snake?'registerSnakeSamuraiPlayer':'registerRansenPlayer']=()=>new Promise(resolve=>{release=resolve;});const cleanup=effect(hook,snake?'const heartbeat = async':'const register = async',f.globals);let second=false;const original=release;await [...f.intervals.keys()][0]();assert.equal(release,original);cleanup();release({ok:true});await flush();
});
test('zero recipients produce no periodic snapshot',()=>{
 const f=fixture('PLAYING');f.globals.multiplayer={isHost:true,recipientCount:0};f.globals.isHost=true;f.globals.recipientCount=0;
 effect(app,snake?'const publish = () => broadcastSnapshot':'const publish = () => multiplayer.publishSnapshot',f.globals);assert.equal(f.intervals.size,0);
});
test('hour budget from actual recovery/discovery interval',()=>{
 if(snake){const f=fixture('LOBBY',null);f.globals.callSnakeSamuraiControl=async()=>({ok:true,phase:'LOBBY'});f.globals.setControlError=()=>{};effect(app,'const syncLobby = async',f.globals);assert.deepEqual([...f.intervals.values()],[30000]);assert.equal(3600000/[...f.intervals.values()][0],120);}
 else {const f=fixture('PLAYING');Object.assign(f.globals,{gameStartedAt:1000,callRansenControl:async()=>({ok:true,phase:'OFF'}),ARENA_ID:'main'});effect(app,'const recoverEncounters = async',f.globals);assert.deepEqual([...f.intervals.values()],[30000]);assert.equal(3600000/[...f.intervals.values()][0],120);}
});

test('periodic snapshot budget and host handoff',()=>{
 const f=fixture('PLAYING');let sends=0;
 Object.assign(f.globals,{isHost:true,recipientCount:1,mode:'free',broadcastSnapshot:()=>sends++,SNAKE_SAMURAI_ROOM_ID:'snake-free',themeRef:{current:'free'},startedAtRef:{current:1000},boundsRef:{current:{}},snakesRef:{current:{}},foodsRef:{current:{}},gameStartedAt:1000,arenaName:'main',authoritativeSlimesRef:{current:[]},authoritativeEncountersRef:{current:[]}});
 f.globals.multiplayer={isHost:true,recipientCount:1,publishSnapshot:()=>sends++};f.globals.setInterval=f.globals.window.setInterval;f.globals.clearInterval=f.globals.window.clearInterval;
 const cleanup=effect(app,snake?'const publish = () => broadcastSnapshot':'const publish = () => multiplayer.publishSnapshot',f.globals);
 const [[timer,ms]]=[...f.intervals];assert.equal(ms,snake?120:500);for(let n=0;n<3600000/ms;n++)timer();assert.equal(sends,1+(snake?30000:7200));cleanup();assert.equal(f.intervals.size,0);
 f.globals.isHost=false;f.globals.multiplayer.isHost=false;effect(app,snake?'const publish = () => broadcastSnapshot':'const publish = () => multiplayer.publishSnapshot',f.globals);assert.equal(f.intervals.size,0);
});
test('foreground recovery events, hidden suppression, cleanup',async()=>{
 const f=fixture(snake?'LOBBY':'PLAYING',null);let gets=0;
 Object.assign(f.globals,{gameStartedAt:1000,ARENA_ID:'main',callRansenControl:async()=>{gets++;return {ok:true,phase:'OFF'};},callSnakeSamuraiControl:async()=>{gets++;return {ok:true,phase:'LOBBY'};},setControlError:()=>{}});
 const cleanup=effect(app,snake?'const syncLobby = async':'const recoverEncounters = async',f.globals);await flush();const timer=[...f.intervals.keys()][0];
 f.globals.document.visibilityState='hidden';for(let n=0;n<120;n++)await timer();assert.equal(gets,snake?1:0);
 f.globals.document.visibilityState='visible';f.listeners.get('visibilitychange')();await flush();assert.equal(gets,snake?2:1);
 f.listeners.get('online')();await flush();assert.equal(gets,snake?3:2);for(let n=0;n<120;n++)await timer();assert.equal(gets,snake?123:122);cleanup();assert.equal(f.listeners.size,0);await timer();assert.equal(gets,snake?123:122);
});
test('room discovery exact-hour count and hidden suppression',async()=>{
 const text=source('components/ArenaCards.tsx');const f=fixture('OFF');let gets=0;
 Object.assign(f.globals,{callRansenControl:async()=>{gets++;return {ok:true,phase:'OFF'};},setStatuses:()=>{}});
 const cleanup=effect(text,'const refresh = async',f.globals);await flush();assert.equal(gets,2);const [[timer,ms]]=[...f.intervals];assert.equal(ms,60000);
 for(let i=0;i<60;i++)await timer();assert.equal(gets,122);f.globals.document.visibilityState='hidden';for(let i=0;i<60;i++)await timer();assert.equal(gets,122);cleanup();assert.equal(f.intervals.size,0);
});

test('baseline comparison: repeated registration outside lobby',async()=>{
 const base=snake?'637e729af26b81ed9e326cc690d7c867fbcf75dd':'be0f3d096cacf92c78221f41dc481a7c6fc122d9';
 const file=snake?'frontend/useSnakeSamuraiMultiplayer.ts':'frontend/useRansenMultiplayer.ts';
 const old=execFileSync('git',['show',`${base}:${file}`],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 const f=fixture(snake?'LOBBY':'PLAYING');effect(old,snake?'const heartbeat =':'const register =',f.globals);await flush();f.globals.phaseRef.current='PLAYING';const timer=[...f.intervals.keys()][0];for(let i=0;i<720;i++){timer();await flush();}assert.equal(f.calls(),721);
 const next=fixture('PLAYING');effect(hook,snake?'const heartbeat = async':'const register = async',next.globals);await flush();assert.equal(next.calls(),0);
});
