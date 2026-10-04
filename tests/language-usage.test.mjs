import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildSync } = require('esbuild');
const bundle = buildSync({
  entryPoints: [new URL('../supabase/functions/snake-language-validate/index.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'cjs',
  external: ['npm:@supabase/supabase-js@2.110.5'], write: false, logLevel: 'silent',
}).outputFiles[0].text;

function fixture(fetchImpl = async () => Response.json({})) {
  const handlers = []; const clientOptions = []; const logs = [];
  const context = vm.createContext({
    module: { exports: {} }, exports: {},
    require(specifier) {
      assert.equal(specifier, 'npm:@supabase/supabase-js@2.110.5');
      return { createClient(_url, _key, options) {
        clientOptions.push(options);
        return { from(table) {
          assert.equal(table, 'ransen_questions');
          const query = {
            select(columns) { assert.equal(columns, 'id,text,options'); return this; },
            eq() { return this; },
            then(resolve, reject) {
              return options.global.fetch('https://database.invalid/rest/v1/ransen_questions?apikey=query-secret', {
                method: 'GET', headers: { apikey: 'query-secret' },
              }).then(async response => {
                if (!response.ok) throw new Error('REST query failed');
                return resolve({ data: await response.json(), error: null });
              }, reject);
            },
          };
          return query;
        } };
      } };
    },
    Deno: {
      serve(handler) { handlers.push(handler); },
      env: { get(name) { return name === 'SUPABASE_URL' ? 'https://database.invalid' : name === 'SUPABASE_SECRET_KEYS' ? '{}' : 'service-key-for-test'; } },
    },
    fetch: fetchImpl, URL, URLSearchParams, Request, Response, Headers, AbortSignal, TextEncoder, TextDecoder,
    console: { error(...args) { logs.push(args.map(String).join(' ')); }, log() {}, warn() {} },
  });
  vm.runInContext(bundle, context);
  assert.equal(handlers.length, 1);
  return { handler: handlers[0], clientOptions, logs };
}
const request = (body, origin = 'https://h.kazeabc.com') => new Request('https://function.invalid/validate', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const usage = response => JSON.parse(response.headers.get('x-game-usage'));

test('OPTIONS and cache hits have exposed usage headers and zero internal calls', async () => {
  let calls = 0;
  const { handler } = fixture(async () => {
    calls++;
    return Response.json({ query: { pages: { '5': { revisions: [{ slots: { main: { '*': '{{ja}}' } } }] } } } });
  });
  const options = await handler(new Request('https://function.invalid/validate', { method: 'OPTIONS' }));
  assert.equal(options.status, 200);
  assert.match(options.headers.get('access-control-expose-headers'), /x-game-usage/i);
  assert.deepEqual(usage(options), []);
  const first = await handler(request({ text: 'こんにちは', theme: 'free' }));
  assert.equal((await first.json()).valid, true);
  assert.equal(calls, 1); assert.equal(usage(first).length, 1);
  const cached = await handler(request({ text: 'こんにちは', theme: 'free' }));
  assert.equal((await cached.json()).valid, true);
  assert.equal(calls, 1); assert.deepEqual(usage(cached), []);
});

test('disaster REST calls use the current request-local fetch collector', async () => {
  let calls = 0;
  const { handler, clientOptions, logs } = fixture(async input => {
    calls++; assert.match(String(input), /ransen_questions/);
    return Response.json([{ id: 'q1', text: '防災の備え', options: ['避難所', '水', '火', '薬'] }]);
  });
  const response = await handler(request({ text: '避難所', theme: 'disaster', playlistId: 'snake-disaster' }));
  const result = await response.json();
  assert.equal(result.valid, true, JSON.stringify({ result, logs }));
  assert.equal(calls, 1); assert.equal(typeof clientOptions[0]?.global?.fetch, 'function');
  const samples = usage(response); assert.equal(samples.length, 1); assert.equal(samples[0].method, 'GET');
  const header = response.headers.get('x-game-usage');
  for (const secret of ['database.invalid', 'query-secret', 'service-key-for-test', '避難所']) assert.equal(header.includes(secret), false);
});

test('dictionary path records one Wiktionary call or two calls with Tatoeba fallback', async () => {
  const calls = [];
  const fallback = fixture(async input => {
    calls.push(String(input));
    if (calls.length === 1) return Response.json({ query: { pages: { '0': { missing: true } } } });
    return Response.json({ data: [{ text: '今日は学校へ行きます。' }] });
  });
  const response = await fallback.handler(request({ text: '学校へ', theme: 'study' }));
  assert.equal((await response.json()).valid, true);
  assert.equal(calls.length, 2); assert.equal(usage(response).length, 2);

  const oneCall = [];
  const direct = fixture(async input => {
    oneCall.push(String(input));
    return Response.json({ query: { pages: { '8': { revisions: [{ slots: { main: { '*': '{{ja}}' } } }] } } } });
  });
  const directResponse = await direct.handler(request({ text: '伝統文化', theme: 'free' }));
  assert.equal((await directResponse.json()).valid, true);
  assert.equal(oneCall.length, 1); assert.equal(usage(directResponse).length, 1);
});

test('upstream failure reports measured call metadata without URL, credentials or input text', async () => {
  const { handler, logs } = fixture(async () => { throw new Error('request failed for secret.invalid?key=private-token'); });
  const response = await handler(request({ text: 'ひみつの入力', theme: 'free' }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, valid: false, reason: 'validation_unavailable' });
  const header = response.headers.get('x-game-usage');
  const samples = JSON.parse(header);
  assert.equal(samples.length, 1); assert.equal(samples[0].method, 'GET');
  assert.equal(samples[0].responseReceived, false);
  for (const value of ['secret.invalid', 'private-token', 'ひみつの入力', 'authorization', 'apikey']) {
    assert.equal(header.toLowerCase().includes(value.toLowerCase()), false);
  }
  assert.equal(logs.length, 1);
});
