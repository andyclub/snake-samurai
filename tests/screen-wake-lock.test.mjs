import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const source = readFileSync(new URL('../frontend/wakeLockController.ts', import.meta.url), 'utf8');
const compiled = transformSync(source, { loader: 'ts', format: 'esm' }).code;
const { WakeLockController } = await import('data:text/javascript,' + encodeURIComponent(compiled));
const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };
function handle() {
  const listeners = new Set();
  return { released: false, releases: 0,
    addEventListener(_, fn) { listeners.add(fn); },
    removeEventListener(_, fn) { listeners.delete(fn); },
    async release() { this.releases++; this.released = true; for (const fn of listeners) fn(); },
    systemRelease() { this.released = true; for (const fn of [...listeners]) fn(); },
  };
}
test('unsupported is transparent and never requests', () => {
  const states = []; const c = new WakeLockController(undefined, s => states.push(s));
  c.update(true, true, true); assert.equal(states.at(-1), 'unsupported'); c.dispose();
});
test('idle, off, hidden and disposed release; visible resumes without polling', async () => {
  const states = [], handles = [];
  const c = new WakeLockController({ async request() { const h = handle(); handles.push(h); return h; } }, s => states.push(s));
  c.update(true, false, true); assert.equal(handles.length, 0);
  c.update(true, true, true); await flush(); assert.equal(states.at(-1), 'active');
  c.update(true, true, false); await flush(); assert.equal(handles[0].releases, 1);
  c.update(true, true, true); await flush(); assert.equal(handles.length, 2);
  c.update(false, true, true); await flush(); assert.equal(handles[1].releases, 1); assert.equal(states.at(-1), 'off');
  c.update(true, true, true); await flush();
  c.update(true, false, true); await flush(); assert.equal(handles[2].releases, 1);
  c.update(true, true, true); await flush(); c.dispose(); await flush(); assert.equal(handles[3].releases, 1);
});
test('request rejection is observable; repeated updates do not retry; explicit retry works', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let requests = 0; const states = [];
  const c = new WakeLockController({ async request() { if (++requests === 1) throw Error('mock rejected'); return handle(); } }, s => states.push(s));
  c.update(true, true, true); await flush(); assert.equal(states.at(-1), 'failed');
  c.update(true, true, true); await flush(); assert.equal(requests, 1);
  c.retry(); await flush(); assert.equal(requests, 2); assert.equal(states.at(-1), 'active'); c.dispose(); await flush();
});
test('system release clears active state without reacquiring until manual retry', async () => {
  let requests = 0; let h; const states = [];
  const c = new WakeLockController({ async request() { requests++; h = handle(); return h; } }, s => states.push(s));
  c.update(true, true, true); await flush(); h.systemRelease(); assert.equal(states.at(-1), 'released');
  c.update(true, true, true); await flush(); assert.equal(requests, 1);
  c.retry(); await flush(); assert.equal(requests, 2); c.dispose(); await flush();
});
test('late completion after hide, off or unmount is released and never shown active', async () => {
  for (const kind of ['hide', 'off', 'dispose']) {
    let resolve; const states = []; const h = handle();
    const c = new WakeLockController({ request() { return new Promise(r => { resolve = r; }); } }, s => states.push(s));
    c.update(true, true, true);
    if (kind === 'hide') c.update(true, true, false);
    if (kind === 'off') c.update(false, true, true);
    if (kind === 'dispose') c.dispose();
    resolve(h); await flush(); assert.equal(h.releases, 1); assert.ok(!states.includes('active'));
  }
});
test('requests stay serial across hide/show while an earlier request is pending', async () => {
  let resolve; let requests = 0; const old = handle(), next = handle();
  const c = new WakeLockController({ request() { requests++; return requests === 1 ? new Promise(r => { resolve = r; }) : Promise.resolve(next); } }, () => {});
  c.update(true, true, true); c.update(true, true, false); c.update(true, true, true);
  assert.equal(requests, 1); resolve(old); await flush();
  assert.equal(old.releases, 1); assert.equal(requests, 2); c.dispose(); await flush();
});
