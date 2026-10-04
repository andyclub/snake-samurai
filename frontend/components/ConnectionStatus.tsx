import React, { useState } from 'react';
import type { HostConnectionFailure } from '../hostTransport';

const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSergjEZdyfpqHWrkKDZgaDsGGVd880dc38B1Axp7KD9DP6aRA/viewform';

interface Props {
  failure: HostConnectionFailure | null;
  busy: boolean;
  roomId: string;
  site: 'g.kazeabc.com' | 'h.kazeabc.com';
  onRetry: () => void;
  t: (key: string) => string;
}

export default function ConnectionStatus({ failure, busy, roomId, site, onRetry, t }: Props) {
  const [copyStatus, setCopyStatus] = useState('');
  if (!failure) return null;
  const unavailable = ['HOST_NOT_CONFIGURED', 'HOST_MODE_UNAVAILABLE', 'SELECTED_HOST_UNAVAILABLE', 'HOST_UNAVAILABLE', 'HOST_STARTING', 'HOST_MODE_DISABLED'].includes(failure.code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({
        code: failure.code, status: failure.status, operation: failure.operation,
        at: failure.at, room: roomId,
        build: `V${__REPO_COMMIT_COUNT__} ${__BUILD_DATE__} by ${site}`,
      }, null, 2));
      setCopyStatus('connection.copied');
    } catch {
      setCopyStatus('connection.copyFailed');
    }
  };
  return (
    <aside role="alert" className="fixed bottom-3 left-3 right-3 z-[150] mx-auto max-w-xl rounded-xl border border-amber-400/50 bg-slate-950/95 p-3 text-sm text-white shadow-xl">
      <p>{t(unavailable ? 'connection.unavailable' : 'connection.interrupted')}</p>
      <p className="mt-1 text-xs text-slate-400">{failure.code}{failure.status ? ` · HTTP ${failure.status}` : ''}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={onRetry} className="rounded-lg bg-amber-300 px-3 py-2 font-bold text-slate-950 disabled:opacity-60">
          {t(busy ? 'connection.retrying' : 'connection.retry')}
        </button>
        <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">{t('feedback.form')}</a>
        <button type="button" onClick={() => { void copy(); }} className="text-slate-300 underline">{t('connection.copy')}</button>
      </div>
      {copyStatus && <p role="status" className="mt-1 text-xs text-slate-300">{t(copyStatus)}</p>}
    </aside>
  );
}
