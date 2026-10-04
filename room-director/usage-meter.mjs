export const SOURCES=['shanghai','korea','director','lease','cleanup','frontend','edge','relay'];
export const GAMES=['ransen','snake'];
export const HOUR_MS=3600000;
const OPS=new Set(['periodic-write','periodic-state-broadcast']);
const label=(v,n)=>{if(typeof v!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(v))throw new TypeError('invalid '+n);return v;};
const num=(v,n)=>{if(!Number.isFinite(v)||v<0)throw new TypeError('invalid '+n);return v;};
const count=(v,n)=>{if(!Number.isSafeInteger(v)||v<0)throw new TypeError('invalid '+n);return v;};
const bucket=()=>({http:{methods:{}},realtime:{sent:{messages:0,bytes:0},received:{messages:0,bytes:0}},wss:{sentBytes:0,receivedBytes:0},periodicWrites:0,periodicStateBroadcasts:0,transports:{}});
const add=(a,b)=>{for(const[m,x]of Object.entries(b.http.methods)){const y=a.http.methods[m]||=Object.fromEntries(['requests','responses','requestBytes','responseBytes','errors','unmeasuredRequestBodies','unmeasuredResponses'].map(k=>[k,0]));for(const k of Object.keys(y))y[k]+=x[k]||0;}for(const d of['sent','received'])for(const k of['messages','bytes'])a.realtime[d][k]+=b.realtime[d][k];a.wss.sentBytes+=b.wss.sentBytes;a.wss.receivedBytes+=b.wss.receivedBytes;a.periodicWrites+=b.periodicWrites;a.periodicStateBroadcasts+=b.periodicStateBroadcasts;for(const[t,n]of Object.entries(b.transports))a.transports[t]=(a.transports[t]||0)+n;return a;};
const bodyBytes=async b=>{if(b==null)return 0;if(typeof b==='string')return new TextEncoder().encode(b).length;if(typeof URLSearchParams!=='undefined'&&b instanceof URLSearchParams)return new TextEncoder().encode(b.toString()).length;if(typeof Blob!=='undefined'&&b instanceof Blob)return b.size;if(b instanceof ArrayBuffer||ArrayBuffer.isView(b))return b.byteLength;return null;};
const requestBytes=async(input,init)=>{if(init&&Object.prototype.hasOwnProperty.call(init,'body'))return bodyBytes(init.body);if(typeof Request!=='undefined'&&input instanceof Request&&input.body)try{return(await input.clone().arrayBuffer()).byteLength;}catch{return null;}return 0;};
/** Privacy-safe counters only: raw URLs, headers, bodies, payloads and error text are discarded. */
export class UsageMeter{
 constructor({runId,variant,collectorId,durationMs=0,real=false}){this.runId=label(runId,'runId');this.variant=label(variant,'variant');this.collectorId=label(collectorId,'collectorId');this.collectorIds=new Set([this.collectorId]);this.durationMs=num(durationMs,'durationMs');this.real=Boolean(real);this.coverage=new Set();this.pending=new Set();this.measurementErrors=0;this.buckets=Object.fromEntries(SOURCES.map(s=>[s,Object.fromEntries(GAMES.map(g=>[g,bucket()]))]));}
 context({source,game,runId,variant,durationMs,transport='unknown'}){if(!SOURCES.includes(source))throw new TypeError('invalid source');if(!GAMES.includes(game))throw new TypeError('invalid game');if(runId!=null&&label(runId,'runId')!==this.runId)throw Error('runId mismatch');if(variant!=null&&label(variant,'variant')!==this.variant)throw Error('variant mismatch');if(durationMs!=null)this.durationMs=Math.max(this.durationMs,num(durationMs,'durationMs'));const b=this.buckets[source][game],t=label(transport,'transport');this.coverage.add(source+'/'+game);b.transports[t]=(b.transports[t]||0)+1;return b;}
 markSourceCovered(source,game,metadata={}){this.context({...metadata,source,game});}
 recordHttp({source,game,method='GET',requestBytes=0,responseBytes=0,responseReceived=true,ok=true,operation,...meta}){const b=this.context({...meta,source,game,transport:meta.transport||'http'}),m=String(method).toUpperCase();if(!/^[A-Z]{1,12}$/.test(m))throw TypeError('invalid method');if(operation!=null&&!OPS.has(operation))throw TypeError('invalid operation');const s=b.http.methods[m]||=Object.fromEntries(['requests','responses','requestBytes','responseBytes','errors','unmeasuredRequestBodies','unmeasuredResponses'].map(k=>[k,0]));s.requests++;if(requestBytes==null)s.unmeasuredRequestBodies++;else s.requestBytes+=num(requestBytes,'requestBytes');if(responseReceived){s.responses++;if(responseBytes==null)s.unmeasuredResponses++;else s.responseBytes+=num(responseBytes,'responseBytes');}if(!ok)s.errors++;if(operation==='periodic-write')b.periodicWrites++;if(operation==='periodic-state-broadcast')b.periodicStateBroadcasts++;}
 recordRealtime({source,game,direction,messages=1,bytes=0,operation,...meta}){if(!['sent','received'].includes(direction))throw TypeError('invalid Realtime direction');if(operation!=null&&!OPS.has(operation))throw TypeError('invalid operation');const b=this.context({...meta,source,game,transport:meta.transport||'realtime'});b.realtime[direction].messages+=count(messages,'messages');b.realtime[direction].bytes+=num(bytes,'bytes');if(operation==='periodic-write')b.periodicWrites++;if(direction==='sent'&&operation==='periodic-state-broadcast')b.periodicStateBroadcasts++;}
 recordWss({source,game,direction,bytes=0,...meta}){if(!['sent','received'].includes(direction))throw TypeError('invalid WSS direction');const b=this.context({...meta,source,game,transport:meta.transport||'websocket'});b.wss[direction==='sent'?'sentBytes':'receivedBytes']+=num(bytes,'bytes');}
 recordOperation({source,game,operation,...meta}){if(!OPS.has(operation))throw TypeError('invalid operation');const b=this.context({...meta,source,game,transport:'operation'});if(operation==='periodic-write')b.periodicWrites++;else b.periodicStateBroadcasts++;}
 wrapFetch(fetchImpl=globalThis.fetch,context={}){if(typeof fetchImpl!=='function')throw TypeError('fetch required');const{source,game,operation,...meta}=context;if(!SOURCES.includes(source)||!GAMES.includes(game))throw TypeError('source and game required');const meter=this;return async function(input,init){const method=String(init?.method||input?.method||'GET').toUpperCase();let req=null;try{req=await requestBytes(input,init);}catch{meter.measurementErrors++;}try{const response=await fetchImpl(input,init);if(response.headers?.get && String(typeof input==='string'||input instanceof URL?input:input?.url || '').match(/\/functions\/v1\/(ransen-control|snake-language-validate)(?:[?/#]|$)/))meter.consumeEdgeUsage(response.headers.get('x-game-usage'),game);meter.recordHttp({source,game,method,requestBytes:req,responseBytes:0,responseReceived:true,ok:response.ok,operation,...meta,transport:'fetch'});let p;try{p=response.clone().arrayBuffer().then(buf=>{meter.buckets[source][game].http.methods[method].responseBytes+=buf.byteLength;}).catch(()=>{meter.buckets[source][game].http.methods[method].unmeasuredResponses++;meter.measurementErrors++;});}catch{meter.buckets[source][game].http.methods[method].unmeasuredResponses++;meter.measurementErrors++;return response;}meter.pending.add(p);p.finally(()=>meter.pending.delete(p));return response;}catch(error){meter.recordHttp({source,game,method,requestBytes:req,responseReceived:false,ok:false,operation,...meta,transport:'fetch'});throw error;}};}
 consumeEdgeUsage(raw,game) {
   if(raw==null){this.measurementErrors++;return;}
   let entries;
   try{entries=JSON.parse(raw);}catch{this.measurementErrors++;return;}
   if(!Array.isArray(entries)||entries.length>100){this.measurementErrors++;return;}
   for(const entry of entries){
     try{
       if(!entry||!['edge','lease','director','cleanup'].includes(entry.source))throw Error('invalid edge source');
       this.recordHttp({...entry,game});
     }catch{this.measurementErrors++;}
   }
 }
 async flush(){while(this.pending.size)await Promise.allSettled([...this.pending]);}
 async report() {
   await this.flush();
   const bySourceGame = JSON.parse(JSON.stringify(this.buckets));
   const byGame = Object.fromEntries(GAMES.map(game => [game, bucket()]));
   for (const source of SOURCES) for (const game of GAMES) add(byGame[game], bySourceGame[source][game]);
   const total = bucket();
   for (const game of GAMES) add(total, byGame[game]);
   return {
     runId: this.runId,
     variant: this.variant,
     durationMs: this.durationMs,
     real: this.real,
     byteScope: 'payload',
     collectorIds: [...this.collectorIds].sort(),
     bySourceGame,
     byGame,
     total,
     coverage: [...this.coverage].sort(),
     measurementErrors: this.measurementErrors,
   };
 }
 static merge(items) {
   if (!Array.isArray(items) || !items.length || items.some(item => !(item instanceof UsageMeter))) {
     throw TypeError('collectors required');
   }
   if (items.some(item => item.pending.size > 0)) throw Error('flush collectors before merge');
   const first = items[0];
   const out = new UsageMeter({
     runId: first.runId,
     variant: first.variant,
     collectorId: 'merged',
     durationMs: Math.min(...items.map(item => item.durationMs)),
     real: items.every(item => item.real),
   });
   out.collectorIds.clear();
   out.coverage.clear();
   out.buckets = Object.fromEntries(SOURCES.map(source => [
     source, Object.fromEntries(GAMES.map(game => [game, bucket()])),
   ]));
   out.measurementErrors = 0;
   for (const item of items) {
     if (item.runId !== first.runId) throw Error('runId mismatch');
     if (item.variant !== first.variant) throw Error('variant mismatch');
     for (const collectorId of item.collectorIds) {
       if (out.collectorIds.has(collectorId)) throw Error('duplicate collector: ' + collectorId);
       out.collectorIds.add(collectorId);
     }
     for (const source of SOURCES) for (const game of GAMES) {
       add(out.buckets[source][game], item.buckets[source][game]);
     }
     for (const coverage of item.coverage) out.coverage.add(coverage);
     out.measurementErrors += item.measurementErrors;
   }
   return out;
 }
 async idleGate({ requiredCollectors, requiredSources = SOURCES, operationClassification, platformOutbound } = {}) {
   const report = await this.report();
   const reasons = [];
   if(operationClassification!=='complete')reasons.push('periodic operations classification is incomplete');
   if(!platformOutbound || platformOutbound.complete!==true || platformOutbound.runId!==report.runId
     || platformOutbound.variant!==report.variant || platformOutbound.durationMs<HOUR_MS
     || !GAMES.every(game=>Number.isFinite(platformOutbound.byGame?.[game])&&platformOutbound.byGame[game]>=0))
     reasons.push('platform outbound evidence missing or incomplete');
   if (!Array.isArray(requiredCollectors) || !requiredCollectors.length) {
     reasons.push('required collector list missing');
   } else {
     const have = new Set(report.collectorIds);
     const missing = requiredCollectors.filter(collector => !have.has(label(collector, 'required collector')));
     if (missing.length) reasons.push('missing collectors: ' + missing.join(','));
   }
   if (!report.real) reasons.push('measurement is local/mock or includes a non-real collector');
   if (report.durationMs < HOUR_MS) reasons.push('measurement duration is shorter than one hour');
   const pairs = requiredSources.flatMap(source => {
     if (!SOURCES.includes(source)) throw TypeError('invalid required source');
     return GAMES.map(game => source + '/' + game);
   });
   const missingCoverage = pairs.filter(pair => !report.coverage.includes(pair));
   if (missingCoverage.length) reasons.push('missing source coverage: ' + missingCoverage.join(','));
   if (report.measurementErrors) reasons.push('measurement errors observed');
   const unmeasuredBytes = Object.values(report.total.http.methods).some(method =>
     method.unmeasuredRequestBodies > 0 || method.unmeasuredResponses > 0);
   if (unmeasuredBytes) reasons.push('HTTP payload bytes were not fully measured');
   const getCounts = Object.fromEntries(GAMES.map(game => [
     game, report.byGame[game].http.methods.GET?.requests || 0,
   ]));
   const gates = {
     getBelowLimit: Object.fromEntries(GAMES.map(game => [game, getCounts[game] < 240])),
     noPeriodicWrites: report.total.periodicWrites === 0,
     noPeriodicStateBroadcasts: report.total.periodicStateBroadcasts === 0,
   };
   if (!reasons.length) {
     if (Object.values(gates.getBelowLimit).some(value => !value)) {
       reasons.push('GET budget is not below 240 for every game');
     }
     if (!gates.noPeriodicWrites) reasons.push('periodic writes observed');
     if (!gates.noPeriodicStateBroadcasts) reasons.push('periodic state broadcasts observed');
   }
   const unverified = reasons.some(reason =>
     /required collector|missing collector|local\/mock|duration|missing source coverage|measurement error|payload bytes|classification|outbound evidence/.test(reason));
   return {
     status: reasons.length ? (unverified ? 'unverified' : 'fail') : 'pass',
     pass: reasons.length === 0,
     reasons,
     gates,
     getCounts,
     report,
   };
 }
}
