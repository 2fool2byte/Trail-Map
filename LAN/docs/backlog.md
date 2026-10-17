# Product Backlog

**Last updated:** 2026-10-17  
**Reference:** `docs/vision.md`, `docs/spec.md`

---

## Epics

| Epic ID | Title | Description | Target |
|---------|-------|-------------|--------|
| E1 | Scaffold & protocol | Node/TS repo, CLI entry, shared wire types | Sprint 1 |
| E2 | Relay room | WebSocket relay, room code, peer cap, overlay IPs | Sprint 1 |
| E3 | Client session | Join, status lights, reconnect, interactive commands | Sprint 1–2 |
| E4 | Overlay ping & messages | Ping/pong RTT, `say` broadcast | Sprint 1 |
| E5 | File exchange | Send/receive builds with sha256 into `incoming/` | Sprint 1–2 |
| E6 | Docs & packaging | README, SETUP (guest isolation + hotspot), teammate zip path | Sprint 1–2 |
| E7 | Hardening | Auto-reconnect polish, HTML status page, firewall helper | Sprint 2 |
| E8 | Real overlay IPs | Optional loopback TUN, configurable peer cap | Sprint 3 |

---

## Sprints

### Sprint 1 — Three local clients join a relay, ping over the overlay, and land a file in `incoming/`

| Issue | Title | Epic | Points | Status |
|-------|-------|------|--------|--------|
| WL-001 | Scaffold Node + TypeScript + npm scripts | E1 | 2 | Done |
| WL-002 | Shared protocol types and JSON codec | E1 | 3 | Done |
| WL-003 | Relay: HTTP/WS server, room code, bind URL print | E2 | 5 | Done |
| WL-004 | Relay: 3-peer join, overlay IPs, reject 4th | E2 | 3 | Done |
| WL-005 | Client join + peer-list + status table | E3 | 5 | Done |
| WL-006 | Overlay ping and `say` | E4 | 3 | Done |
| WL-007 | File send/receive with sha256 | E5 | 5 | Done |
| WL-008 | Room + protocol unit tests | E1 | 3 | Done |
| WL-009 | README for judges/demo | E6 | 2 | Done |
| WL-010 | SETUP.md isolation + hotspot fallback | E6 | 2 | Done |
| WL-011 | CLI help and Incoming folder default | E3 | 2 | Done |

**Sprint 1 total:** 35 points — **complete**

**Sprint 1 goal (testable):** `npm test` passes; on one PC, relay + three join sessions show three **connected** peers, overlay ping RTT prints, and `send` copies a file into another session’s `incoming/` with matching sha256.

---

### Sprint 2 — Survive Wi-Fi drops and make teammate setup boring

| Issue | Title | Epic | Points | Status |
|-------|-------|------|--------|--------|
| WL-012 | Heartbeat degraded/isolated lights | E3 | 3 | Done |
| WL-013 | Auto-reconnect with backoff | E3 | 3 | Done |
| WL-014 | File chunking for >32 MB builds | E5 | 5 | Done |
| WL-015 | Optional local status HTML page on relay | E7 | 3 | Done |
| WL-016 | Windows firewall / bind-address warnings | E7 | 2 | Done |
| WL-017 | Zip packaging script for USB handoff | E6 | 2 | Done |

**Sprint 2 — complete**

---

### Sprint 3 — v2 extras

| Issue | Title | Epic | Points | Status |
|-------|-------|------|--------|--------|
| WL-018 | Optional TUN overlay (admin, documented) | E8 | 8 | Done |
| WL-019 | Raise cap above 3 peers | E8 | 3 | Done |

`--tun` binds overlay IP on loopback (not a WinTUN kernel mesh). `--max-peers` default 3, max 32.

---

## Definition of Done

- [x] Code matches `docs/spec.md`
- [x] Runs locally (`npm run relay` / `npm run join` / `npm run demo`)
- [x] `npm test` passes
- [x] Backlog status updated
