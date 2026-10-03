# Synchronization/idle optimization: final local acceptance

This repository: snake-samurai. Companion-project evidence is labelled below; scope is only these two repositories. Independent no-hardlinks clones on Mac, branch `codex/sync-idle-budget`, originals untouched. No push/merge/deploy, credentials, permissions, paid plan, database schema/data, cron or other business changes. Baselines: Ransen `be0f3d096cacf92c78221f41dc481a7c6fc122d9`; Snake `637e729af26b81ed9e326cc690d7c867fbcf75dd`.

User-reported historical incident: “没有人参与的空闲时间也需要优化。之前某版本里，你把广播时间调得太频，这是八月份突然收到Supabase超量警告的直接原因，因此要作为这两个游戏最高警戒线进行避规。我先睡了，你做出优化方案后立即施工。” This is a hard regression constraint, not independently proven historical causation. Relevant local memory/index lookup found no corroborating billing incident record. No steady broadcast frequency is increased.

## Final changes and safety decision

- Open, dated LOBBY alone renews authoritative admission at the existing 5s cadence (database TTL is 15s). OFF, undated LOBBY, PLAYING and THEATER do not create registration timers. A stable admission boolean avoids retriggering registration on server clock corrections. Slow requests cannot overlap; cancelled effects cannot register again. Snake subscription/presence duplicate registrations were removed.
- Ransen OFF/THEATER no longer broadcast on a 750ms loop. Playing/lobby periodic host snapshots require a remote Presence meta, including spectator/controller/same-device tabs. Presence changes and explicit snapshot requests still synchronize immediately. Active cadences are unchanged: Ransen 500ms; Snake 120ms. Critical transitions, votes, game start and settlement retained.
- The proposed 30s Ransen encounter recovery interval was **withdrawn** because it could miss the 20s voting window. Non-host foreground PLAYING clients retain the original 1.2s interval and first sync; channel reconnect/online/foreground triggers recovery. Hosts do not GET encounters they already simulate. Hidden clients pause recovery. No claim of 3000->120 GET per non-host-hour remains.
- Both homepage ArenaCards refresh two existing cards once/minute instead of every 5s; hidden tabs and concurrent requests skip. Returning to foreground reads immediately. This is a bounded discovery fallback, not a game-state authority. Maximum discovery delay is 60s; explicit entering/control reads current room state. No cross-client cache/coordinator was added: independent pages each own their discovery requests. More aggressive idle backoff is technically possible but trades a longer discovery delay and has not been adopted.
- Snake undated lobby discovery uses 30s rather than 2s, with foreground/online recovery. Dated lobbies retain 2s/750ms near deadline and existing immediate deadline reads. Spectator Presence now survives name/color/connection updates; reconnecting participants retain their own snake membership.
- Both hooks stop after a cancelled first GET, ignore cancelled subscription callbacks and suppress delayed sync after leave. Cleanup clears the channel ref. This fixes the StrictMode/leave-during-fetch ghost-channel path.
- Transport envelopes add publisher/session/sequence; receivers drop repeated/older packets and packets from departed publishers according to current Presence. Sequences cover both periodic and requested snapshots, survive channel reconnect and reset safely on a fresh publisher session. These fields are not persisted game data and are not backend authorization. Legacy packets without metadata remain compatible; complete ordering protection requires updated senders. No lockstep/delta protocol or schema changes.

## Budget (steady hour; initial, user and reconnect events additional)

| Path | Baseline | Final | Unit |
|---|---:|---:|---|
| Ransen non-host visible playing recovery GET | 3000 | 3000 | per client; 1.2s safety retained |
| Ransen host playing recovery GET | 3000 | 0 | per host |
| Hidden Ransen recovery GET | 3000 | 0 | per hidden client; immediate foreground recovery |
| Registration outside dated lobby | 720 | 0 | per connected client; Snake baseline leaks when timer was established in lobby |
| Dated lobby renewal | 720 | 720 | per client; 15s TTL preserved |
| Homepage two-card GETs | 1440 | 120 | per visible page; 0 when hidden |
| Snake undated-lobby GETs | 1800 | 120 | per visible page, in addition to cards |
| Ransen OFF/THEATER periodic states | 4800 | 0 | per room; event/request responses remain |
| Ransen playing periodic states, recipients present | 7200 | 7200 | per room |
| Snake playing periodic snapshots, recipients present | 30000 | 30000 | per room |
| Playing periodic snapshots, no remote recipients | 7200 / 30000 | 0 | Ransen / Snake; critical/initial sends remain |
| Playing periodic persistence | 1800 / 1200 | 1800 / 1200 | Ransen / Snake per host; recovery/settlement preserved |

Two visible idle pages therefore generate 240 control GETs/hour (2 pages × 2 cards × 60 refreshes). With all game pages closed there are no frontend timers; watched ongoing rounds intentionally retain physics/persistence. Backend activity is separate: director retains its 5s heartbeat against a 15s lease (theoretical 17280/day), plus conditional lobby actions; sweeps unchanged. The reported ~5161/day control source was not verified in live logs. Remote controller polling is another retained path, not counted in these homepage figures.

Realtime budgeting counts sends and remote deliveries; `self:false` excludes a self receipt. Ordering adds 124 bytes with one-digit sequence, up to 128 bytes at five digits, per stamped packet for UUID-sized IDs. Rough added active sender payload is <=0.922MB/hour Ransen or <=3.84MB/hour Snake, plus recipient copies. It adds no periodic messages; do not conflate bandwidth and message savings or promise total savings percentages.

## Repeatable verification

Mac Node 23.11.0; unit tests use built-in TypeScript stripping. `npm ci --ignore-scripts`, `node --test scripts/*test.mjs`, `npm run build`. Browser runners in scripts support `PLAYWRIGHT_MODULE` pointing to an existing Playwright runtime, `TAILWIND_FIXTURE` pointing to the cached existing public Tailwind script, and `SYNC_TEST_SCOPE=changed` for final-only runs. Start baseline/current Vite servers on 4181/4171 (Ransen), 4182/4172 (Snake); supply the actual baseline Git count to the archived baseline Vite config if no Git checkout is used. Do not use production .env files or credentials.

Browser runners use independent headless Chrome, separate deterministic clients, mocked Supabase HTTP/Realtime Presence/ack/binary broadcast handling, cached Tailwind styles, and block external networking. Only localhost Vite HMR is passed through. Tailwind fixture SHA256: `176e894661aa9cdc9a5cba6c720044cbbf7b8bd80d1c9a142a7c24b1b6c50d15`.

Unit coverage: phase guards, dated lobby admission/cleanup, slow request non-overlap, first-GET cancellation, no-recipient and host-handoff gates, visibility/online recovery, exact-hour source timer comparison, local vote preservation/round validation, same-session order/duplicate rejection, new-host/session recovery, retired-host rejection, spectator update/participant reconnect. Final totals: Ransen 19 passed; Snake 18 passed. Both builds passed; existing >500kB chunk warning retained.

Type check command: `node_modules/.bin/tsc --noEmit --jsx react-jsx --module esnext --target es2022 --moduleResolution bundler --skipLibCheck --allowSyntheticDefaultImports frontend/*.tsx frontend/*.ts`. Both fail on existing baseline errors: Ransen1070, Snake576 diagnostics; final message multisets identical, zero introduced diagnostics. This is not a passing type check.

Controlled browser checks passed: two clients first entering; dated lobby becoming PLAYING via canonical GET; playing with spectators only; all state packets dropped 4s; reverse replay of 8 dropped snapshots; real WebSocket close/rejoin; both hidden and foreground/online; host departure/new election; surviving host reaches actual game termination and persists THEATER; a new client restores actual score/theater UI. No page runtime exceptions in successful final runs. Production listeners accepted the newest replay and rejected 7 older replays, then rejected the departed-host packet. These are local mock integration results, not live service or device/network acceptance.

Ransen voting UI: baseline and final recover a lost battle and successfully persist a normal button vote within 2.4s. Final additionally passes with an 800ms delayed GET: question recovered and vote persisted within 3.6s of injection, inside the unchanged 20s window. The test loses state packets; it eventually delivers the critical vote. Permanent loss of every vote packet/host loss before vote persistence is not solved or represented as verified.

## Exact observed same-scenario comparison

Counts below are deltas after initial settle, across two clients. GET/POST/PUT count control Edge HTTP calls, not every static asset or startup Data API read. Snapshot columns include request responses/rejoins, not just periodic packets; fake clock joins can add bounded sync traffic. Each number is an observed controlled run, not an invariant or a real bill.

| Scenario | Baseline GET/POST/PUT | Final GET/POST/PUT | Baseline / final state broadcasts |
|---|---|---|---|
| Ransen OFF, 3600000ms | 2890 / 1445 / 0 | 240 / 0 / 0 | 4800 / 2; final request_state +2 |
| Snake OFF, 3600000ms | 2880 / 0 / 0 | 240 / 0 / 0 | 0 / 1; final request_snapshot +2 |
| Ransen dated lobby, 32000ms | 32 / 13 / 4 | 6 / 12 / 4 | 47 / 48; transition boundaries/requests add messages |
| Snake dated lobby, 32000ms | 28 / 13 / 1 | 28 / 11 / 1 | 37 / 37 |
| Ransen spectators PLAYING, 10000ms | 17 / 4 / 5 | 9 / 0 / 5 | 20 / 20 |
| Snake spectators PLAYING, 10000ms | 0 / 0 / 4 | 0 / 0 / 4 | 84 / 83; timer boundary difference, cadence unchanged |

Ransen both hidden for 3s: baseline GET +6, POST +1, PUT +2; final GET +0, POST +0, PUT +2. The surviving host in final continues persistence and settlement after the other client closes, while its periodic broadcast stops; final state is still persisted. Snake keeps the same persistence behavior with no remaining receivers.

## Remaining release/real-server boundary

Local implementation and controlled integration completed. Not pushed, merged, deployed or verified against current live source/usage. Minimum live-service acceptance dependency is an existing disposable nonproduction Supabase environment with matching functions/migrations and Realtime enabled, existing publishable configuration, isolated test rooms and permission to test there. No new credentials, permission changes or plan changes are required or authorized. If only production is available, do not substitute production load tests.

Real server quota/lease/sweep effects, mixed legacy/new clients, real browser/device rendering/performance and server-side ownership/idempotence remain staging acceptance items. Client transport ordering is not security authorization or server fencing. Merge and production release still require explicit approval. Legacy packets deliberately bypass sequence protection for compatibility; coordinate rollout and verify old-client behavior before release. No claim of complete elimination of backend idle costs.
