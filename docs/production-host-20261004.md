# Shanghai trusted host deployment — 2026-10-04

The Shanghai runtime uses Ransen revision cff3ee95f20c07a18f6e33807f5aec742a086682 and Snake revision 460b4ac36c649d0b78af2740a3157e5bfb5b2ee9. Source archives were checked against Git blobs and verified by SHA-256 after transfer. Tracked environment files were excluded.

The production migration trusted_game_host_fencing was applied to the existing jec schema. The ransen-control Edge Function was deployed as version 11 with its existing custom authentication retained. Host mutations require the trusted role credential; anonymous and authenticated clients cannot execute host acquisition, mode switching, snapshot commits, roster reconciliation, or the legacy hosting claim.

The Shanghai systemd service runs the pinned runtime under /home/ubuntu/kazeabc-releases/20261004-cff3ee9/ransen. Both engines run at the server boundary. Default authority is shanghai-primary; joining, reconnecting, device identity and browser backgrounding do not grant hosting authority.

The private CA and leaf certificate were provisioned separately from Git. Certificate chain and IP SAN verification passed. TCP 28444 serves protected HTTPS and WSS; 28443 stays on loopback. An external request without the relay credential returned HTTP 403.

Both Vercel production projects have the trusted host HTTP/WSS addresses, server-only relay credential and CA configuration. Gateway game attribution is explicit for each project. No credentials are recorded here or exposed through VITE variables. Build count fallbacks remain bound to the exact deployment SHA.

The previous service definition, runtime configuration and Edge source were backed up before switching. A failed host rollout must leave games paused; it must not activate a player or automatically select another host.

This is deployment evidence, not acceptance of the original performance gates. Real one-hour idle totals, reference active-game comparison, complete Realtime traffic and independent egress accounting remain unverified. An isolated correctness test or a short production smoke test does not waive those gates.
