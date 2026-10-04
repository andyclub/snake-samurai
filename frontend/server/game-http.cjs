const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');

function createGameHttp({ primaryUrl, fallbackUrl, relayKey, fallbackRelayKey, ca, supabaseUrl, publishableKey, fetchImpl = fetch, meter, defaultGame='ransen', allowLocalUpstream = false } = {}) {
  const target = value => {
    if (!value) return null;
    const url = new URL(value);
    if (url.username || url.password || url.hash || (url.protocol !== 'https:' &&
      !(allowLocalUpstream && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error('HTTPS host required');
    return url;
  };
  const primary = target(primaryUrl), fallback = target(fallbackUrl);
  const server = http.createServer(async(req,res) => {
    res.setHeader('cache-control','no-store');
    res.setHeader('content-type','application/json');
    const fail = (status, code) => {res.writeHead(status);res.end(JSON.stringify({ok:false,code}));};
    if(req.method!=='POST') {fail(405,'METHOD_NOT_ALLOWED');return;}
    const endpoint = new URL(req.url,'https://localhost').pathname;
    const hostPath=endpoint==='/api/game-session'?'/session':endpoint==='/api/game-command'?'/command':null;
    if(!hostPath){fail(404,'NOT_FOUND');return;}
    let size=0,chunks=[];
    try {
      for await(const chunk of req) {
        size += chunk.length;
        if(size>16384){fail(413,'REQUEST_TOO_LARGE');return;}
        chunks.push(chunk);
      }
      const body=Buffer.concat(chunks);
      const parsed=JSON.parse(body.toString('utf8'));
      const game=typeof parsed.roomId==='string'?parsed.roomId.startsWith('snake-')?'snake':'ransen':defaultGame;
      const routeFetch=meter?.wrapFetch?meter.wrapFetch(fetchImpl,{source:'relay',game}):fetchImpl;
      if(!supabaseUrl || !publishableKey || !primary || !relayKey){fail(503,'HOST_NOT_CONFIGURED');return;}
      // The authoritative mode is read on demand; a primary outage never elects
      // a player or silently redirects to the Korea fallback.
      const route=await routeFetch(new URL('/functions/v1/ransen-control?route=1',supabaseUrl),{
        headers:{apikey:publishableKey},signal:AbortSignal.timeout(8000)
      });
      if(!route.ok){fail(503,'HOST_MODE_UNAVAILABLE');return;}
      const mode=await route.json();
      if(!mode.ok || !['shanghai','fallback','player'].includes(mode.hostMode)){fail(503,'HOST_MODE_UNAVAILABLE');return;}
      const selected=mode.hostMode==='shanghai'?primary:fallback;
      const key=mode.hostMode==='shanghai'?relayKey:(fallbackRelayKey || relayKey);
      if(!selected || !key){fail(503,'SELECTED_HOST_UNAVAILABLE');return;}
      const destination=new URL(hostPath,selected);
      let recorded = false, responseReceived = false, responseSize = 0, responseStatus = null;
      const recordUpstream = ok => {
        if (recorded) return;
        recorded = true;
        meter?.recordHttp?.({ source: 'relay', game, method: 'POST',
          requestBytes: body.length, responseBytes: responseSize, responseReceived, ok,
          status: responseStatus, transport: 'host-http-upstream' });
      };
      const upstream=(destination.protocol==='https:'?https:http).request(destination,{
        method:'POST',headers:{'content-type':'application/json','content-length':body.length,'x-game-relay-key':key},
        ...(ca?{ca}:{}),timeout:10000,
      },response=>{
        responseReceived = true; responseStatus = response.statusCode || 502;
        const output=[];
        response.on('data',chunk=>{
          responseSize+=chunk.length;
          if(responseSize>1048576){upstream.destroy(new Error('Response too large'));return;}
          output.push(chunk);
        });
        response.on('end',async()=>{
          recordUpstream(responseStatus >= 200 && responseStatus < 400);
          if(res.writableEnded)return;
          if(meter?.proxyReport)res.setHeader('x-game-proxy-usage',JSON.stringify(await meter.proxyReport()));
          res.writeHead(response.statusCode || 502);res.end(Buffer.concat(output));
        });
        response.on('error',()=>{recordUpstream(false);if(!res.writableEnded)fail(502,'HOST_RESPONSE_FAILED');});
      });
      upstream.on('timeout',()=>upstream.destroy(new Error('Host timed out')));
      upstream.on('error',()=>{recordUpstream(false);if(!res.writableEnded)fail(503,'HOST_UNAVAILABLE');});
      req.on('aborted',()=>upstream.destroy());
      upstream.end(body);
    } catch {if(!res.writableEnded)fail(400,'INVALID_REQUEST');}
  });
  return server;
}
function fromEnv() {
  const {createProxyMeter}=require('./game-usage.cjs');
  return {
    meter:createProxyMeter(),
    defaultGame:process.env.GAME_MEASURE_PAGE_GAME || 'ransen',
    primaryUrl:process.env.GAME_HOST_HTTP_URL,fallbackUrl:process.env.GAME_FALLBACK_HTTP_URL,
    relayKey:process.env.GAME_RELAY_KEY,fallbackRelayKey:process.env.GAME_FALLBACK_RELAY_KEY,
    ca:(process.env.GAME_HOST_CA_FILE || process.env.GAME_HOST_CA_PATH)?fs.readFileSync(process.env.GAME_HOST_CA_FILE || process.env.GAME_HOST_CA_PATH):(process.env.GAME_HOST_CA_PEM || process.env.GAME_HOST_CA),
    supabaseUrl:process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}
module.exports={createGameHttp,fromEnv};
