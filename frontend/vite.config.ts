import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(__dirname, '..');
const git = (args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

const getRevision = () => {
  try {
    return git(['rev-parse', 'HEAD']);
  } catch {
    return process.env.VERCEL_GIT_COMMIT_SHA || '';
  }
};

const hasRevisionMetadata = () => {
  const revision = getRevision();
  return /^[a-f0-9]{40}$/i.test(revision) && process.env.VITE_REPO_COMMIT_SHA === revision;
};

const getCommitCount = () => {
  try {
    if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
      execFileSync('git', ['fetch', '--unshallow', 'origin'], { cwd: repoRoot, stdio: 'ignore' });
    }
    if (git(['rev-parse', '--is-shallow-repository']) !== 'false') {
      throw new Error('Git history is still shallow');
    }
    const count = Number(git(['rev-list', '--count', 'HEAD']));
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid Git commit count');
    return count;
  } catch (error) {
    const configuredCount = Number(process.env.VITE_REPO_COMMIT_COUNT);
    if (Number.isSafeInteger(configuredCount) && configuredCount >= 1 && hasRevisionMetadata()) {
      return configuredCount;
    }
    throw new Error(`Unable to determine complete repository commit count; provide full Git history or revision-matched VITE_REPO_COMMIT_COUNT and VITE_REPO_COMMIT_SHA: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const getBuildDate = () => {
  let revisionDate: string;
  try {
    revisionDate = git(['show', '-s', '--format=%cI', 'HEAD']);
  } catch {
    if (!hasRevisionMetadata() || !process.env.VITE_BUILD_DATE) {
      throw new Error('Unable to determine revision date; provide revision-matched VITE_BUILD_DATE and VITE_REPO_COMMIT_SHA');
    }
    revisionDate = process.env.VITE_BUILD_DATE;
  }
  // Require an explicit timezone so the date does not depend on the build host.
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(revisionDate)) {
    throw new Error('Revision date must be an ISO timestamp with an explicit timezone');
  }
  const date = new Date(revisionDate);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid revision date');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      define: {
        '__REPO_COMMIT_COUNT__': JSON.stringify(getCommitCount()),
        '__BUILD_DATE__': JSON.stringify(getBuildDate()),
        // This is just generic value for the GEMINI API key.
        // This is not used at all, and can be ignored!
        'process.env.API_KEY' : JSON.stringify('api-key-this-is-not-used-can-be-ignored!'),
      },
      server: {
        proxy: {
          //Target your Node.js backend
          '/api-proxy': 'http://localhost:5000',
          '/ws-proxy': {target: 'ws://localhost:5000', ws: true},
        },
      },
      plugins: react(),
      build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('react')) {
                  return 'vendor-react';
                }
                if (id.includes('@supabase')) {
                  return 'vendor-supabase';
                }
                if (id.includes('lucide-react')) {
                  return 'vendor-lucide';
                }
              }
            }
          }
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
