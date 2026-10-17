# Vision Generation Prompt

**Version:** 1.0  
**Purpose:** Produce `docs/vision.md` only. Do **not** write application code, scaffold projects, generate installers, or implement networking protocols while using this prompt.

---

## Role

You are a product strategist and systems designer for a **time-boxed hackathon collaboration tool**. You understand campus **guest Wi-Fi client isolation** (stations cannot ping or talk to each other on the local LAN) and the practical overlays teams use instead: userspace mesh/VPN, a reachable relay, or a temporary local hotspot. Your output must be actionable for three student developers who need a working path **this weekend**, not an enterprise networking product.

## Product Name

**Wifi_LAN** (working title) — a small, deployable overlay that lets **three laptops** on **URI guest Wi-Fi** discover each other, exchange messages, and send **build/integration files** despite AP client isolation.

## Problem Context (mandatory)

URI guest Wi-Fi is expected to:

| Constraint | Implication for v1 |
|------------|--------------------|
| **Client isolation** | Direct L2/L3 peer traffic (ICMP, SMB, arbitrary TCP to another guest client) is blocked at the access point |
| **Guest policy** | Do not assume admin AP access, VLAN changes, or campus IT exceptions |
| **Event setting** | Three teammates, Windows laptops, limited setup time, need to share **build files** for the hackathon project |
| **Honesty** | A “virtual switch/router” **cannot magically reverse AP isolation**. v1 must pick an overlay that still works: **relay**, **userspace mesh over allowed outbound paths**, and/or **one laptop as a local hotspot / USB-Ethernet fallback** |

The vision must name this constraint in the problem statement and choose a **primary path** plus **fallback**, not pretend a software switch on each laptop will see other isolated stations.

## Platform & Delivery Requirement (mandatory)

| Aspect | Requirement |
|--------|-------------|
| **Hosts** | Three Windows laptops (primary). Call out Linux/macOS as nice-to-have, not v1-blocking |
| **Install** | Teammate-ready **build/package** (folder, zip, or single installer) plus a **one-page setup** the other two machines can follow without the author present |
| **Privileges** | Prefer **no Administrator** for the happy path. If TAP/WinTUN or hotspot requires elevation, the vision must say so and keep a **no-admin fallback** (e.g. HTTPS/WebSocket relay or browser-based share) |
| **Data ownership** | Traffic and files stay among the three teammates; no requirement for campus accounts beyond guest Wi-Fi |
| **Exclusion** | Not a campus-wide mesh, not a rogue AP attack, not a tool to probe or attack other guests, not a replacement for official wired venues |

## Audience

| Segment | Needs |
|---------|--------|
| **Lead laptop (you)** | Start the overlay, see who is online, push build artifacts to the other two |
| **Teammate laptop** | Unzip/run, join with a short code or link, receive files, confirm they are on the same overlay |
| **Integrator** | Drop received builds into the hackathon app with a predictable folder/layout |

## Core Capabilities

### Overlay connectivity

- Create a **virtual LAN-like overlay** among exactly **three** named peers (stable display names, not raw MACs as the UX)
- Survive **URI guest client isolation** via a documented mechanism (pick one primary in vision):
  1. **Outbound overlay** — if guest allows HTTPS/UDP outbound, use a rendezvous/relay or mesh (Tailscale-like / WireGuard-like / WebRTC-like **concept**, not a mandated vendor)
  2. **Local hotspot / second NIC** — one machine shares a private SSID or USB Ethernet; others join for true L2
  3. **Internet relay** — a small reachable broker the three clients connect **out** to
- Show **connected / degraded / isolated** status per peer (not just “running”)
- Optional ICMP-like **reachability check on the overlay** (prove the overlay works even when guest ping fails)

### Virtual switch / router (product language)

- Present a simple mental model: **one virtual switch** the three laptops plug into
- If routing is in scope, it is **overlay routing only** (NAT/forward among overlay IPs), not hijacking campus default routes unless the user explicitly opts into “send hackathon traffic via overlay”
- Assign **stable overlay addresses** or equivalent identities so teammates can point the hackathon app at `peer-name` or an overlay IP

### File & build exchange

- Send **build files / folders** (binaries, zips, config) from any peer to one or both others
- Progress, checksum or size confirmation, and a default **incoming** folder
- Small **text/status messages** (“new build ready”) so the team does not depend on Discord for the last mile

### Discovery & join

- Join with a **short shared secret** (room code, invite file, or QR) generated on the lead machine
- No public directory of other guests on URI Wi-Fi
- Rejoin after sleep/Wi-Fi drop without a full reinstall

### Deploy to three machines

- Repeatable **package** the lead can copy (USB, the overlay itself once one hop exists, or a cloud link)
- Setup: install/run → enter code → wait for three green peers
- Document **what to do if guest isolation + no outbound UDP** (hotspot fallback)

## Non-Goals (v1)

- Bypassing URI security policy, attacking client isolation, spoofing the campus AP, or scanning other guests
- Bridging arbitrary campus VLANs or impersonating network infrastructure
- Supporting more than **three** peers as a design target (four+ is v2)
- Full enterprise VPN, MDM, or always-on background service
- Guaranteeing a software-only L2 switch that works **only** with isolated guest clients and **no** relay/hotspot
- Shipping the hackathon application itself (Wifi_LAN is the **collaboration pipe**, not the team’s product)

## Experience Principles

1. **Isolation is the enemy, not the teammates** — UX should explain “guest Wi-Fi blocked LAN; overlay is up” in one line.
2. **Three machines in under ten minutes** — setup time is a first-class requirement.
3. **Honest topology** — show whether the path is relay, mesh, or hotspot.
4. **Files over theory** — success is a build landing on the other two laptops, not a pretty packet diagram.
5. **Least privilege** — admin only when the chosen datapath truly needs a TUN/TAP or hosted network.
6. **Fail loud** — if a peer cannot join, say **why** (blocked UDP, captive portal, missing adapter) and name the fallback.
7. **Hackathon-safe** — no surprise internet exposure of the team’s source tree; prefer authenticated overlay + local receive folder.

## Environment Assumptions

- Event network: **URI guest Wi-Fi** with client isolation and unknown outbound firewall (HTTPS likely; ICMP between clients no; UDP/VPN unknown).
- Devices: three student Windows PCs; mixed NICs; possible phone hotspot as last resort.
- Time: one hackathon; documentation must be usable at 2 a.m.

## Deliverable

Write **`docs/vision.md`** with exactly these sections (in order):

1. Executive summary (2–3 paragraphs) — product name, three-laptop overlay, URI guest isolation
2. Problem statement and success metrics (include a concrete “three peers green + file received” definition)
3. User personas (lead deployer, teammate joiner, integrator)
4. Feature pillars with user stories (`As a … I want … so that …`) — overlay join, status, file send, fallback path
5. Topology & networking strategy (why AP isolation blocks a naive virtual switch; primary overlay vs hotspot vs relay; what “virtual router/switch” means in v1)
6. Information architecture (screens/CLI commands a teammate actually sees)
7. Delivery & packaging (how the other two computers get the build of **this** tool)
8. Security & acceptable-use (team-only, no attacking isolation, secrets, file trust)
9. Phased roadmap (MVP this weekend → v1 polish → v2 extras)
10. Risks and mitigations (captive portal, blocked outbound, admin rights, Windows firewall, sleep/Wi-Fi roam)
11. Open questions for the team (exact overlay technology, whether a public relay is allowed, Windows version, wired fallback availability)

**Quality bar:** Clear headings, tables for topology options and constraints, concrete examples (sample room code, sample “peer B received `app-build.zip`”). Tone: practical, hackathon-paced, technically honest. No source code, no packet-crafting exploits, no campus-bypass instructions framed as attacks.

---

*Original product intent: `docs/prompt.md`*
