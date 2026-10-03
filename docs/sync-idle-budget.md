# Idle synchronization budget and release gate

Baseline: snake-samurai 637e729af26b81ed9e326cc690d7c867fbcf75dd. Implementation branch: codex/sync-idle-budget. Source checkout copied with `git clone --no-hardlinks`; original Mac checkout untouched. No credentials, schema, policies, cron, production data or deployment changed.

User-reported incident: “没有人参与的空闲时间也需要优化。之前某版本里，你把广播时间调得太频，这是八月份突然收到Supabase超量警告的直接原因，因此要作为这两个游戏最高警戒线进行避规。我先睡了，你做出优化方案后立即施工。” This is a hard regression constraint. Local memory summaries/index and relevant experience index did not identify corroborating billing/incident evidence. Historical causation remains unverified. No broadcast cadence increases are introduced.

## Implementation

- The former stable phaseRef dependency allowed a lobby heartbeat to continue in PLAYING. The effect now depends on actual admission state and checks the ref on every tick. Duplicate subscription/presence registration calls were removed; the admission effect owns renewal. Only an open, dated LOBBY renews authoritative registration at the existing 5s cadence (15s database TTL). OFF, undated idle LOBBY, PLAYING and THEATER do not create that timer. The dependency is a stable admission boolean, so clock/deadline adjustments cannot trigger repeated immediate registrations. Requests do not overlap; cancelled/stale effects cannot register again.
- Host periodic snapshots require another Presence meta, including controller/spectator and same-device tabs. Presence changes restart the effect and send an initial full snapshot. OFF/THEATER are event/request driven. Snake movement snapshots remain 120ms; no interpolation or delta format change. Critical encounters, commands and end-of-round paths retain their existing sends/writes.
- Companion Ransen encounter recovery keeps first sync; channel connection changes restart it, online/foreground events request recovery, and visible clients have a 30s fallback. Requests do not overlap. Existing same-round validation and vote-preserving merge remain. Healthy sockets still incur fallback reads: this change does not implement snapshot-gap detection.
- Homepage room discovery reads two cards once/minute, skips hidden pages and concurrent requests, and refreshes on foreground. Discovery may lag up to 60s; explicit join/control remains authoritative. Both cards are preserved, including the existing disaster link; no disaster backend/game code changed.

- Snake LOBBY without a deadline polls visible clients every 30s rather than 2s; dated lobbies retain 2s/750ms near-deadline polling and immediate transition reads. Foreground/online triggers recover sooner; requests cannot overlap. The 250ms deadline tick itself is local; existing deadline requests remain.

## Theoretical budget (steady hour, initial/events additional)

| Path | Baseline | Changed | Unit / recovery cost |
|---|---:|---:|---|
| Companion Ransen playing recovery GET | 3000 | 120 | per visible client; up to 30s for missed encounters, foreground/online reconnect can recover sooner |
| Registration outside dated lobby | 720 | 0 | per connected game client; lobby TTL unaffected |
| Dated lobby registration | 720 | 720 | per client; first sync/name changes/reconnect additional |
| Homepage discovery | 1440 | 120 | two GETs/refresh per visible page; up to 60s discovery delay |
| Undated snake lobby discovery | 1800 | 120 | per visible client; up to 30s fallback |
| Hidden discovery/recovery | repeated | 0 | resumes with immediate read |
| Companion Ransen OFF/THEATER periodic host state | 4800 | 0 | per room; events/request responses remain |
| Snake playing periodic state, receivers present | 30000 | 30000 | per room; no interpolation/cadence change |
| Snake playing periodic state, no receivers | 30000 | 0 | per room; initial/critical sends remain |
| Snake playing periodic persistence | 1200 | 1200 | per host; preserves recovery and settlement |

Broadcast send plus remote deliveries count toward Realtime usage; `self:false` excludes a self receipt. Payload compression alone would not reduce message count. None of these estimates is a real bill or a claimed total percentage reduction.

Director still has a 5s lease heartbeat (theoretical 17280/day), plus conditional expired-lobby reads/start requests. SQL sweep/control code is unchanged. A frontend optimization cannot make an always-on backend lease free; changing it needs a separate verified lease/fallback design. The earlier reported ~5161 control/day and continuous sweep source were not verified against live logs.

## Verification

Run `npm ci --ignore-scripts`, `node --test scripts/sync-budget.test.mjs`, `npm run build`. Tests execute the actual effect bodies with mocked transport/timers, not a separate budget model. They cover idle phases, lobby admission, phase transition cleanup, cancelled effects, slow-request non-overlap, no-recipient/host handoff gates, 30s recovery, visibility/online recovery, exact-hour card counts, idle lobby polling and discovery. Ransen-specific encounter/vote tests are in the companion repository. Baseline comparison runs the old registration effect: 721 calls including initial versus 0 in PLAYING.

Build passed. Type check failed on both baseline and changed source: 576 diagnostics, identical error-message multiset, zero introduced diagnostics. Existing missing React declarations and other repository type errors were not repaired out of scope. No existing unit test script was provided.

Independent headless Chrome, two contexts, real Vite app, mocked Supabase HTTP/WebSocket, all other external network blocked: exact simulated OFF hour increased GET by 240 across two pages, POST/PUT by 0. Total request_snapshot increased by 2; no snapshot broadcast occurred. This mock protocol may rejoin and send bounded sync requests; do not report it as zero total Realtime traffic or real weak-network acceptance. No production request/billing measurement occurred. Screenshots and harness are in the parent task output/playwright directory.

## Release boundary

Reviewable local commit only. Not pushed, merged, deployed or checked against live deployed source. Approval is required for merge/production deployment. Before release, complete an integration environment test with faithful Realtime transport: dated lobby join/leave and start, real spectators during play, foreground/background, packet drop/reorder, weak-network channel reconnect, host departure/election, final settlement/rejoin. The effect tests cover individual guards; the OFF browser test does not validate these complete multiplayer flows. Snapshot monotonic sequencing/host fencing was not added, so packet-order acceptance remains an existing unverified risk. The active 120ms cadence is intentionally retained.
