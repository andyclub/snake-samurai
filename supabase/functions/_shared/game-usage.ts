// Request-local internal REST/RPC accounting. No URLs, headers, keys or rows retained.
export function createEdgeUsage(fetchImpl: typeof fetch = fetch) {
  const samples: Array<Record<string, unknown>> = [];
  const measuredFetch: typeof fetch = async (input, init) => {
    const target = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const source = (target.includes('/rpc/acquire_game_host') || target.includes('/rpc/start_game_host')) ? 'lease'
      : target.includes('/rpc/sync_game_lobby') || target.includes('/game_room_director') || target.includes('/game_playlists') ? 'director'
      : method === 'DELETE' ? 'cleanup' : 'edge';
    let requestBytes: number | null = 0;
    try {
      if (typeof init?.body === 'string') requestBytes = new TextEncoder().encode(init.body).byteLength;
      else if (init?.body != null) requestBytes = null;
      else if (input instanceof Request && input.body) requestBytes = (await input.clone().arrayBuffer()).byteLength;
    } catch { requestBytes = null; }
    const sample = { source, method, requestBytes, responseBytes: null as number | null, responseReceived: false, ok: false };
    samples.push(sample);
    const response = await fetchImpl(input, init);
    sample.responseReceived = true; sample.ok = response.ok;
    try { sample.responseBytes = (await response.clone().arrayBuffer()).byteLength; } catch { /* unknown bytes explicitly retained */ }
    return response;
  };
  return { fetch: measuredFetch, samples };
}
export function withEdgeUsage(handler: (req: Request, usage: ReturnType<typeof createEdgeUsage>) => Promise<Response>) {
  return async (req: Request) => {
    const usage = createEdgeUsage();
    let response: Response;
    try { response = await handler(req, usage); }
    catch {
      response = new Response(JSON.stringify({ ok: false, code: 'INTERNAL_HOST_ERROR' }), {
        status: 500, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    const headers = new Headers(response.headers);
    // Every invocation reports its internal calls, including failures and GETs.
    headers.set('Access-Control-Expose-Headers', [headers.get('Access-Control-Expose-Headers'), 'x-game-usage'].filter(Boolean).join(', '));
    headers.set('x-game-usage', JSON.stringify(usage.samples));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}
