# Wifi_LAN — Product Vision

**Version:** 1.0  
**Status:** Stakeholder vision (not an engineering spec)  
**Source:** `docs/prompts.md` ← `docs/prompt.md`

---

## 1. Executive summary

**Wifi_LAN** is a small overlay for **three Windows laptops** that need to behave like they are on the same LAN while connected to **URI guest Wi-Fi**. Guest networks isolate clients: teammates cannot ping each other, cannot open a teammate’s local IP, and cannot drop build files over SMB. That isolation is a feature of the access point, not a bug in Windows.

Wifi_LAN does **not** turn isolation off. It gives the team a **private virtual switch**: each laptop joins a room with a short code, gets a stable overlay identity (name + logical overlay address), sees **connected / degraded / isolated** for the other two peers, and can send **build files** and short status messages. Under the hood, v1 uses a **userspace relay** all three machines connect **out** to (or to a lead laptop that is reachable because the team switched to a **hotspot / USB Ethernet** fallback).

Success this weekend is not a campus-scale mesh. Success is: **three green peers and `app-build.zip` in the other machines’ Incoming folders**, with a package the lead can copy to teammates without being present.

---

## 2. Problem statement and success metrics

### Problem

| Constraint | What teammates experience |
|------------|---------------------------|
| Client isolation | ICMP, SMB, and arbitrary TCP to another guest client fail |
| No AP admin | Cannot ask URI IT for a VLAN or isolation exception mid-hackathon |
| Integration pressure | Three people must share binaries, zips, and configs **in the room** |
| Time | Setup must work in about **ten minutes**, including the “it still failed” path |

A naive “virtual switch/router” installed on each PC **cannot see other isolated stations**. Those frames never leave the AP toward other guests. The product must pick a path that still works.

### Success metrics (v1)

| Metric | Target |
|--------|--------|
| Join time | Three named peers **green** in ≤ 10 minutes after unzip (hotspot or reachable relay) |
| Overlay proof | Guest ping between laptops **fails**; overlay reachability **succeeds** |
| File proof | Lead sends `app-build.zip`; both others show size + checksum and file in `incoming/` |
| Capacity | Exactly **3** peers in the room (4th rejected or waitlisted, not designed-for) |
| Privileges | Happy path **no Administrator**; fallback docs if hotspot/TUN needs elevation |
| Honesty | UI/CLI shows topology: **relay** vs **hotspot/LAN** (not a fake L2 miracle) |

**Definition of done for a demo:** three peers green + one file received on both other laptops.

---

## 3. User personas

### Maya — Lead deployer

Maya owns the Wifi_LAN package. She starts the relay (or hotspot), reads a **room code** like `URI-7K2P`, watches two joiners come online, and pushes `team-app/dist` as a zip. She needs fail-loud errors (“cannot bind port”, “peer Dana isolated”) not silent hangs.

### Jordan — Teammate joiner

Jordan is not a networking person. They unzip, run `join`, type the code and their display name **Dana**, wait for greens, and drag received files into the hackathon repo. They need a one-page setup that still works if Maya is at food.

### Sam — Integrator

Sam does not care how packets move. They care that Incoming is always `%USERPROFILE%\Wifi_LAN\incoming\` (or the repo `incoming/` folder) with a predictable filename so they can copy into the team app. They want a one-line “new build ready” message so they are not hunting Discord.

---

## 4. Feature pillars with user stories

### Overlay join

- As Maya, I want to start a room and print a **room code + relay URL**, so that Jordan can join without a lecture.
- As Jordan, I want to join with **name + code**, so that I appear as a person, not a MAC address.
- As Maya, I want a 4th laptop rejected with a clear message, so that we do not pretend v1 is a venue mesh.

### Status (virtual switch lights)

- As Jordan, I want to see Maya and Sam as **connected / degraded / isolated**, so that I know whether to send a file or switch to hotspot.
- As Maya, I want one line of topology text (“path: relay on 192.168.137.1”), so that judges and teammates share the same mental model.

### Overlay reachability (“ping”)

- As Maya, I want an overlay ping that succeeds when guest ICMP fails, so that we can prove the product to judges in 30 seconds.

### File and build exchange

- As Maya, I want to send `app-build.zip` to Dana and Sam with progress, so that integration is not a USB scavenger hunt.
- As Sam, I want Incoming + size/checksum, so that I trust the file before I overwrite dist.

### Messages

- As Maya, I want to send “new build ready”, so that we do not depend on Discord for the last mile.

### Fallback path

- As Maya, I want documented **hotspot / USB Ethernet** steps when nobody can reach the relay on guest Wi-Fi, so that isolation plus a locked-down outbound firewall does not end the project.

---

## 5. Topology and networking strategy

### Why a naive virtual switch fails

Guest **client isolation** (AP/STA isolation) drops station-to-station traffic at the access point. A TAP adapter, Hyper-V switch, or “software router” on each laptop never receives the other guests’ frames. Wifi_LAN will not claim otherwise.

### What “virtual switch / router” means in v1

| Term | v1 meaning |
|------|------------|
| Virtual switch | Three named ports; frames/messages are **userspace** messages through the relay, not real Ethernet bridging of guest Wi-Fi |
| Overlay address | Stable logical IDs, e.g. Maya `10.77.0.1`, Jordan `10.77.0.2`, Sam `10.77.0.3` — for display and for “point the app at this peer” later |
| Router | **Not** replacing Windows default route. No campus NAT hijack. Optional later: only overlay-bound traffic |

### Path choice (primary + fallback)

| Priority | Path | When |
|----------|------|------|
| **Primary** | **Userspace relay** — all clients open an outbound WebSocket/HTTP connection to one reachable host | Guest allows the three laptops to reach **that host** (lead on hotspot, USB LAN, unisolated network, or a teammate-run relay on a reachable address) |
| **Fallback A** | **Windows mobile hotspot / phone hotspot** — lead shares SSID; others join; relay binds on lead’s hotspot IP | Guest isolation + cannot reach any shared host |
| **Fallback B** | **USB Ethernet / travel switch** | Wireless still broken; cables exist |
| **Out of v1** | Kernel WireGuard/WinTUN mesh, public commercial VPN as a hard dependency, attacking isolation |

**Primary for this product:** relay in **this repo**, started by the lead. Clients never need to open inbound ports on guest Wi-Fi. They only need **outbound TCP** to the relay. On isolated guest Wi-Fi **without** a reachable rendezvous, the team **must** use hotspot/USB so the lead’s relay IP is on a LAN the others can route to.

Example room code: `URI-7K2P`.  
Example receive line: `Dana received app-build.zip (12.4 MB, sha256 ab12…9f)`.

---

## 6. Information architecture

v1 is **CLI-first** (fast on three Windows laptops). A tiny local status page is optional polish, not the MVP.

| Surface | What the user sees |
|---------|-------------------|
| `npm run relay` | Room code, bind URL, “waiting for 3 peers”, topology = relay |
| `npm run join -- --name Dana --code URI-7K2P --relay ws://192.168.137.1:7788` | Join result, overlay IP, peer table |
| `status` | Table: name, overlay IP, light, last seen |
| `ping` | Overlay RTT to one or all peers |
| `send <file> [peer\|all]` | Progress; remote Incoming confirmation |
| `say <text>` | Short status broadcast |
| Incoming folder | Default `incoming/` next to the app |
| `docs/SETUP.md` | Guest isolation explainer + hotspot fallback |

No public directory of other URI guests. Discovery is **code + URL** only.

---

## 7. Delivery and packaging

How the **other two computers** get **this** tool:

1. Lead zips the repo (or `dist/` + `package.json`) onto USB, email, or cloud **once**.
2. Teammates unzip, `npm install`, run join (Node LTS required; documented).
3. After overlay is up, later Wifi_LAN updates can ride **Wifi_LAN file send**.
4. One-page `SETUP.md`: install Node → unzip → start/join → greens → send file → if fail, hotspot.

Windows is v1. Linux/macOS is “might work if Node does”; not a blocker.

---

## 8. Security and acceptable use

| Rule | Product behavior |
|------|------------------|
| Team-only | Room code required; max 3 peers; no guest scan |
| Not an attack tool | No AP spoofing, isolation bypass, or probing other stations |
| Secrets | Code is a shared secret for the weekend; rotate if leaked at the venue |
| File trust | Checksum displayed; we do not execute received files |
| Exposure | Relay is for the team; do not port-forward it to the whole internet without understanding the risk |
| Data | Files land on local disk in Incoming; no mandatory cloud account |

Wifi_LAN is the **collaboration pipe**, not the hackathon product and not campus infrastructure.

---

## 9. Phased roadmap

| Phase | Scope |
|-------|--------|
| **MVP (this weekend)** | Relay + join + 3-peer cap + status lights + overlay ping + send file + say + SETUP.md + zip-able Node app |
| **v1 polish** | Better progress UI, auto-reconnect after sleep, Windows firewall helper text, optional status HTML page, checksum in a sidecar file |
| **v2** | Optional TUN overlay IPs for real TCP to peers, >3 peers, Linux/macOS first-class, QR join, no-Node single exe |

---

## 10. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Captive portal | Complete guest login **before** join; SETUP says so |
| Blocked outbound to lead | Hotspot / USB fallback; never promise guest-only L2 |
| Admin rights | MVP uses userspace TCP/WebSocket only |
| Windows Firewall | SETUP: allow Node on private networks when using hotspot |
| Sleep / Wi-Fi roam | Auto-reconnect with same name/code; lights go **degraded** then **isolated** |
| Relay on guest IP teammates cannot reach | Print “if this IP is a guest address, use hotspot”; show interface list |
| Trusting files | Checksum + human copy into app; no auto-run |
| Scope creep | Cap 3; no attacking isolation; no TUN in MVP |

---

## 11. Open questions for the team

1. Confirm all three machines are **Windows** and which versions (10/11).
2. Is a **phone hotspot** allowed in the venue if URI guest plus outbound to a lead PC fails?
3. Do we have a **USB Ethernet adapter or travel switch** as last resort?
4. Should overlay addresses stay **display-only** (MVP) or must the hackathon app bind TCP to them this weekend? (Vision: display-only until v2 TUN.)
5. Is running the relay on Maya’s laptop acceptable, or do we need a **public HTTPS relay** (extra account/cost)?
6. Node.js install on teammate laptops: already present or must SETUP include the installer USB?
7. Maximum build zip size we must support this weekend (e.g. 200 MB vs 2 GB)?

---

*This document is product/strategy only. Implementation lives in `docs/spec.md` after Step 3.*
