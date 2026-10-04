import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import gateway from '../frontend/server/game-http.cjs';
import { UsageMeter } from '../room-director/usage-meter.mjs';
const listen=server=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(r=>server.close(r));
test('mode from trusted platform chooses primary/Korea; outage never falls back',async()=>{
  const hits=[];
  const host=name=>http.createServer((req,res)=>{
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      hits.push({name,path:req.url,key:req.headers['x-game-relay-key'],body:JSON.parse(body)});
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,host:name}));
    });
  });
  const primary=host('shanghai'),fallback=host('korea');
  const primaryUrl=await listen(primary),fallbackUrl=await listen(fallback);
  let mode='shanghai';
  const relay=gateway.createGameHttp({primaryUrl,fallbackUrl,relayKey:'test-relay-key',supabaseUrl:'https://example.test',publishableKey:'test-public',
    allowLocalUpstream:true,fetchImpl:async()=>new Response(JSON.stringify({ok:true,hostMode:mode}))});
  const url=await listen(relay);
  try{
    const send=()=>fetch(url+'/api/game-session',{method:'POST',body:JSON.stringify({publicKey:{test:1}})});
    assert.equal((await (await send()).json()).host,'shanghai');
    mode='fallback';assert.equal((await (await send()).json()).host,'korea');
    mode='player';assert.equal((await (await send()).json()).host,'korea');
    mode='shanghai';
    const command={ticket:'test-ticket',signature:'test-signature',body:{type:'input',targetX:42,targetY:17}};
    assert.equal((await (await fetch(url+'/api/game-command',{method:'POST',body:JSON.stringify(command)})).json()).host,'shanghai');
    assert.equal(hits[3].path,'/command');assert.deepEqual(hits[3].body,command);
    await close(primary);
    assert.equal((await send()).status,503);assert.equal(hits.length,4);
    assert.equal(hits[0].key,'test-relay-key');assert.equal(hits[0].path,'/session');
  }finally{await close(relay);if(primary.listening)await close(primary);await close(fallback);}
});
test('missing config, insecure hosts and invalid requests cannot proxy',async()=>{
  assert.throws(()=>gateway.createGameHttp({primaryUrl:'http://example.com'}));
  const relay=gateway.createGameHttp();
  const url=await listen(relay);
  try{
    assert.equal((await fetch(url+'/api/game-session',{method:'POST',body:'{}'})).status,503);
    assert.equal((await fetch(url+'/api/game-session')).status,405);
    assert.equal((await fetch(url+'/api/game-session',{method:'POST',body:'bad'})).status,400);
  }finally{await close(relay);}
});

test('repository root CommonJS API entries load the shared gateway without credentials', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    const gateway = require('./frontend/server/game-http.cjs');
    const originalCreate = gateway.createGameHttp;
    gateway.createGameHttp = options => {
      assert.equal(options.defaultGame, 'snake');
      return originalCreate(options);
    };
    for (const name of ['game-ws','game-session','game-command']) {
      const handler = require('./api/' + name + '.js');
      assert.ok(handler instanceof http.Server);
      assert.equal(handler.listening, false);
      handler.close();
    }
  `], { cwd: new URL('../', import.meta.url), env: { PATH: process.env.PATH || '', NODE_ENV: 'test' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('meter separates route GET from upstream POST payload, status failures and transport errors', async () => {
  const samples = [];
  let status = 200, partial = false;
  const primary = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (partial) {
        res.writeHead(200, { 'content-length': 100 }); res.write('途中');
        setTimeout(() => res.destroy(), 20);
      } else { res.writeHead(status); res.end(status === 200 ? '返事' : '欠'); }
    });
  });
  const primaryUrl = await listen(primary);
  const meter = new UsageMeter({ runId: 'test-only', variant: 'candidate', collectorId: 'test-relay', real: false });
  const record = meter.recordHttp.bind(meter);
  meter.recordHttp = sample => { samples.push({ ...sample }); record(sample); };
  const relay = gateway.createGameHttp({
    primaryUrl, relayKey: 'test-key', supabaseUrl: 'https://unit.invalid', publishableKey: 'test-public',
    allowLocalUpstream: true, defaultGame: 'snake', meter,
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, hostMode: 'shanghai' })),
  });
  const url = await listen(relay);
  const body = JSON.stringify({ note: '日本' });
  const send = () => fetch(url + '/api/game-session', { method: 'POST', body });
  try {
    assert.equal(await (await send()).text(), '返事');
    status = 502; assert.equal((await send()).status, 502);
    partial = true; assert.ok([502, 503].includes((await send()).status));
    await close(primary);
    assert.equal((await send()).status, 503);
    const upstream = samples.filter(sample => sample.transport === 'host-http-upstream');
    assert.equal(upstream.length, 4, 'Record exactly once despite overlapping response/request errors');
    assert.ok(upstream.every(sample => sample.source === 'relay' && sample.game === 'snake' && sample.method === 'POST'));
    assert.ok(upstream.every(sample => sample.requestBytes === Buffer.byteLength(body)));
    assert.equal(upstream[0].status, 200); assert.equal(upstream[0].ok, true); assert.equal(upstream[0].responseBytes, 6);
    assert.equal(upstream[1].status, 502); assert.equal(upstream[1].ok, false); assert.equal(upstream[1].responseBytes, 3);
    assert.equal(upstream[2].responseReceived, true); assert.equal(upstream[2].ok, false); assert.equal(upstream[2].responseBytes, 6);
    assert.equal(upstream[3].responseReceived, false); assert.equal(upstream[3].ok, false);
    assert.equal(samples.filter(sample => sample.transport === 'fetch' && sample.method === 'GET').length, 4);
    const report = await meter.report();
    assert.equal(report.bySourceGame.relay.snake.http.methods.GET.requests, 4);
    assert.equal(report.bySourceGame.relay.snake.http.methods.POST.requests, 4);
    assert.equal(report.bySourceGame.relay.snake.http.methods.POST.errors, 3);
    assert.equal(report.bySourceGame.relay.snake.http.methods.POST.responseBytes, 15);
    assert.equal(JSON.stringify(report).includes('日本'), false);
    assert.equal(JSON.stringify(samples).includes('unit.invalid'), false);
  } finally { await close(relay); if (primary.listening) await close(primary); }
});
