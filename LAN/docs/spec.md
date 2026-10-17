# Wifi_LAN — Software Engineering Specification

**Version:** 0.3  
**Reference:** `docs/vision.md` v1.0  
**Scope:** Sprints 1–3 shipped. Userspace relay overlay; optional loopback `--tun` (not WinTUN).

---

## 1. System overview

Wifi_LAN is a **Node.js TypeScript** app: one **relay process** and up to **N client processes** (default **3**, `--max-peers` up to 32). Clients exchange JSON control messages and binary file frames over **WebSocket**. Logical overlay IPs are assigned by the relay (`10.77.0.1`…`). They are **not** kernel adapters unless `--tun` binds the address on loopback.

### Goals

- Named peers, room code, status lights, overlay ping, chunked file send, short messages, HTML status, auto-reconnect
- Runs on Windows with Node 20+ without Administrator
- Teammates can unzip, `npm install`, join
- Honest topology string on relay and clients

### Non-goals (MVP)

- Kernel VPN / WinTUN mesh, bridging URI guest Wi-Fi, scanning other clients
- Replacing the default Windows route
- Shipping the team’s hackathon app

### Platform note

There is **no owned cloud**. The “platform” is the **relay on a reachable host** (usually the lead laptop on hotspot/LAN). All three clients make **outbound** WebSocket connections to it.

---

## 2. Architecture

```
┌─────────────┐   WS    ┌──────────────────┐   WS    ┌─────────────┐
│  Client A   │────────▶│  Relay (lead)    │◀────────│  Client B   │
│  Maya       │         │  room URI-7K2P   │         │  Jordan     │
│  10.77.0.1  │         │  max 3 sockets   │         │  10.77.0.2  │
└─────────────┘         └────────┬─────────┘         └─────────────┘
                                 │ WS
                                 ▼
                         ┌─────────────┐
                         │  Client C   │
                         │  Sam        │
                         │  10.77.0.3  │
                         └─────────────┘

Guest Wi-Fi isolation: A cannot TCP to B. A and B can TCP to Relay
only if Relay’s bind address is routable (hotspot / USB / same LAN).
```

**Control plane:** JSON text frames (`join`, `peer-list`, `ping`, `pong`, `say`, `file-meta`, `error`).  
**Data plane:** binary WS frames after a `file-meta` (chunked).  
**Virtual switch:** relay fans out messages to room members; it does not bridge Ethernet.

Vision pillars → modules:

| Vision pillar | Module |
|---------------|--------|
| Overlay join | `src/relay/room.ts`, `src/client/join.ts` |
| Status lights | `src/shared/status.ts`, client TUI table |
| Overlay ping | `src/shared/protocol.ts` ping/pong |
| File exchange | `src/client/files.ts`, relay forward |
| Messages | `say` frame |
| Fallback | `docs/SETUP.md` (ops, not code) |
| Packaging | `package.json` scripts, README |

---

## 3. Technology stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Node.js 20 LTS | Prevalent on student Windows; no admin for userspace sockets |
| Language | TypeScript (strict) | Matches other team Cursor projects; typed protocol |
| WS | `ws` | Small, binary-capable |
| CLI | `src/cli.ts` via `tsx` | Fast MVP; no extra CLI framework required |
| Tests | Node built-in `node:test` + `tsx` | Zero extra test runner |
| Checksum | `crypto.createHash('sha256')` | Stdlib |
| Config | CLI flags + env `WIFI_LAN_PORT` | No cloud secrets for MVP |

---

## 4. Repository layout

```
Wifi_LAN/
  docs/
    prompt.md
    prompts.md
    vision.md
    spec.md
    backlog.md
    issues.json
    SETUP.md
  src/
    cli.ts                 # entry: relay | join | status loop commands
    relay/
      server.ts
      room.ts
    client/
      session.ts
      files.ts
      ui.ts
    shared/
      protocol.ts
      status.ts
      ids.ts
  incoming/                # default receive dir (gitkeep)
  incoming/.gitkeep
  test/
    protocol.test.ts
    room.test.ts
  package.json
  tsconfig.json
  README.md
```

---

## 5. Core modules

### Relay (`src/relay`)

- HTTP server + WebSocket upgrade on port **7788** (configurable)
- One room per process (MVP)
- Generates room code `XXX-XXXX` (alphanumeric)
- On `join`: validate code, assign overlay IP; same display name **rejoins** (kick old socket); extra unique names rejected when at cap
- Heartbeat: clients send `hello` ~3s; if last seen >20s → **isolated**, drop socket
- `GET /` HTML status page (auto-refresh 2s)
- Warn guest-like bind addresses and print Windows firewall hint
- Forwards `say`, `ping`, `file-meta`+binary to target or `all`
- Prints bind addresses of non-internal IPv4 interfaces so lead can pick a **reachable** URL

### Client (`src/client`)

- Connect WS, send `join`
- Interactive prompt: `status`, `ping [name]`, `send <path> [name|all]`, `say <text>`, `quit`
- Writes files to `incoming/` (create if missing)
- Reconnect with same name/code on close (backoff 1s, 2s, 5s; max 10)
- Optional `--tun`: bind overlay IP on loopback (Admin); relay remains the datapath

### Shared protocol (`src/shared/protocol.ts`)

Discriminated union `WireMessage`. Version field `v: 1`. Unknown types → error, do not crash.

### Status (`src/shared/status.ts`)

| Light | Rule |
|-------|------|
| connected | Socket up, last heartbeat < 5s |
| degraded | Socket up, last heartbeat 5–20s or reconnecting |
| isolated | No socket or > 20s |

Topology string: `relay` if clients connect to relay host; SETUP tells humans when that host is hotspot vs guest.

---

## 6. Data model / types

```ts
type PeerId = string; // uuid

type OverlayIp = string; // 10.77.0.n

type Light = "connected" | "degraded" | "isolated";

interface Peer {
  id: PeerId;
  name: string;
  overlayIp: OverlayIp;
  light: Light;
  lastSeen: number;
}

interface Room {
  code: string;
  peers: Peer[]; // default max 3; --max-peers
}

type WireMessage =
  | { v: 1; type: "join"; code: string; name: string }
  | { v: 1; type: "welcome"; self: Peer; peers: Peer[]; topology: string }
  | { v: 1; type: "peer-list"; peers: Peer[] }
  | { v: 1; type: "hello"; from: string; ts: number }
  | { v: 1; type: "ping"; from: PeerId; to: PeerId | "all"; nonce: string; ts: number }
  | { v: 1; type: "pong"; from: PeerId; to: PeerId; nonce: string; ts: number }
  | { v: 1; type: "say"; from: PeerId; text: string }
  | { v: 1; type: "file-meta"; from: PeerId; to: PeerId | "all"; name: string; size: number; sha256: string; transferId: string }
  | { v: 1; type: "file-done"; transferId: string; ok: boolean; error?: string }
  | { v: 1; type: "error"; message: string };
```

Binary file chunks: WS binary, prefix 16-byte `transferId` (hex uuid without dashes is 32 chars — use 16-byte raw uuid) then payload. MVP may send **one binary frame per file** if size ≤ 32 MB; larger files chunked 256 KiB.

Persistence: none. Room is in-memory. Incoming files are the only durable artifact.

---

## 7. Persistence

| Data | MVP | Later |
|------|-----|--------|
| Room / peers | RAM on relay | optional disk log |
| Incoming files | local filesystem | same |
| Accounts | none | none for v1 |

---

## 8. Routing and pages

No web router. CLI subcommands:

| Command | Behavior |
|---------|----------|
| `npx tsx src/cli.ts relay [--port 7788] [--max-peers 3]` | Start relay, print code + URLs + status page |
| `npx tsx src/cli.ts join --name NAME --code CODE --relay ws://HOST:PORT [--tun]` | Client session |
| `npx tsx src/cli.ts demo` | Local 3-client smoke |
| `npx tsx src/cli.ts pack` | Zip for USB handoff (no node_modules) |

npm scripts wrap these.

---

## 9. Content organization

Not a content app. User-facing copy lives in:

- `README.md` — what / why / demo for judges
- `docs/SETUP.md` — captive portal, firewall, hotspot fallback
- CLI help strings

Default Incoming: `path.join(process.cwd(), "incoming")`. Override `--incoming`.

---

## 10. Testing strategy

- `npm test` → `node --import tsx --test test/*.test.ts`
- `protocol.test.ts` — round-trip JSON parse/serialize; reject unknown `v`
- `room.test.ts` — 3 joins succeed; 4th `error`; unique names; IP assignment order
- Manual: three terminals on one PC (`127.0.0.1`) as Sprint 1 acceptance
- Manual: two PCs on hotspot as stretch

---

## 11. Accessibility

CLI: stable table layout, no color-only status (print word **connected** plus optional color). Avoid spinners that hide errors. SETUP in plain markdown.

---

## 12. Security / privacy

- Room code: 7 chars, generated with `crypto.randomBytes`
- Join without matching code → close
- Max file size **512 MB** (reject `file-meta` over limit)
- Do not execute received files
- Bind `0.0.0.0` but print warning if the chosen IPv4 looks like a campus guest subnet and teammates may not route to it
- No logging of file contents

---

## 13. Future platform API

If a public relay appears later:

```
POST /rooms → { code, wsUrl }
WS /rooms/:code
```

Not implemented in MVP. Single-process relay is enough.

---

## 14. Deployment

1. Zip repo or clone USB
2. `npm install`
3. Lead: `npm run relay`
4. Others: `npm run join -- --name … --code … --relay ws://LEAD_IP:7788`
5. No installer MSI in MVP
6. Node 20+ required (SETUP)

**Shipped:** local three-process demo + SETUP + README + tests + reconnect + HTML status + pack + optional `--tun` / `--max-peers`.
