import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'frontend/package.json'));
const { transformSync } = require('esbuild');
const source = transformSync(readFileSync(path.join(root, 'frontend/vite.config.ts'), 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code;
const sha = 'a'.repeat(40);
function config({ shallow = false, fetchFails = false, staysShallow = false, gitFails = false, dateFails = false, env = {} } = {}) {
  let isShallow = shallow;
  const calls = [];
  const module = { exports: {} };
  const git = (_command, args) => {
    calls.push(args.join(' '));
    if (gitFails) throw new Error('Git unavailable');
    if (args[0] === 'fetch') {
      if (fetchFails) throw new Error('No fetch credentials');
      isShallow = staysShallow;
      return '';
    }
    if (args[1] === '--is-shallow-repository') return String(isShallow);
    if (args[0] === 'rev-list') return '327';
    if (args[1] === 'HEAD') return sha;
    if (args[0] === 'show') {
      if (dateFails) throw new Error('Revision date unavailable');
      return '2026-01-02T23:30:00+00:00';
    }
    throw new Error('Unexpected Git call');
  };
  vm.runInNewContext(source, {
    module, exports: module.exports, __dirname: path.join(root, 'frontend'),
    process: { env, cwd: () => root },
    require: (id) => id === 'node:child_process' ? { execFileSync: git }
      : id === 'vite' ? { defineConfig: (value) => value, loadEnv: () => ({}) }
      : id === '@vitejs/plugin-react' ? () => [] : require(id),
  });
  return { result: module.exports.default({ mode: 'production' }), calls };
}
test('complete history supplies count and padded Tokyo revision date', () => {
  const { result } = config();
  assert.equal(result.define.__REPO_COMMIT_COUNT__, '327');
  assert.equal(result.define.__BUILD_DATE__, '"2026-01-03"');
});
test('unshallow must actually yield complete history', () => {
  assert.equal(config({ shallow: true }).result.define.__REPO_COMMIT_COUNT__, '327');
  assert.throws(() => config({ shallow: true, staysShallow: true }), /complete repository commit count/);
});
test('failed shallow fetch cannot use Vercel guessed count', () => {
  assert.throws(() => config({ shallow: true, fetchFails: true, env: { VERCEL: '1' } }), /complete repository commit count/);
});
test('external count requires a positive integer and exact current SHA', () => {
  const options = { shallow: true, fetchFails: true };
  assert.equal(config({ ...options, env: { VITE_REPO_COMMIT_COUNT: '400', VITE_REPO_COMMIT_SHA: sha } }).result.define.__REPO_COMMIT_COUNT__, '400');
  for (const env of [
    { VITE_REPO_COMMIT_COUNT: '400' },
    { VITE_REPO_COMMIT_COUNT: '400', VITE_REPO_COMMIT_SHA: 'b'.repeat(40) },
    { VITE_REPO_COMMIT_COUNT: '0', VITE_REPO_COMMIT_SHA: sha },
    { VITE_REPO_COMMIT_COUNT: '1.5', VITE_REPO_COMMIT_SHA: sha },
  ]) assert.throws(() => config({ ...options, env }), /complete repository commit count/);
});
test('Git-unavailable metadata must identify the same revision and date', () => {
  const env = { VERCEL_GIT_COMMIT_SHA: sha, VITE_REPO_COMMIT_SHA: sha, VITE_REPO_COMMIT_COUNT: '400', VITE_BUILD_DATE: '2026-01-02T23:30:00Z' };
  assert.equal(config({ gitFails: true, env }).result.define.__BUILD_DATE__, '"2026-01-03"');
  assert.throws(() => config({ gitFails: true, env: { ...env, VERCEL_GIT_COMMIT_SHA: '' } }), /complete repository commit count/);
  assert.throws(() => config({ dateFails: true }), /revision date/);
});
