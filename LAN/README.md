# Wifi_LAN

Three laptops on **URI guest Wi-Fi** cannot ping each other (AP client isolation). Wifi_LAN is a **userspace virtual switch**: ICMP ping (and optional Windows `ping 10.77.0.x`), plus build-file drop (chunked up to 512 MB).

It does **not** disable campus isolation. Peers meet by connecting **out** to a reachable relay (lead PC on a hotspot/LAN if guest IPs are unreachable).

## Quick demo (one computer)

```bat
npm install
npm test
npm run demo
```

`demo` starts a relay, three clients, overlay ping, and lands `app-build.zip` in temp Incoming folders.

Manual (four terminals):

```bat
npm run relay
```

Copy the room code. Then:

```bat
npm run join -- --name Maya --code WL-XXXX --relay ws://127.0.0.1:7788
npm run join -- --name Jordan --code WL-XXXX --relay ws://127.0.0.1:7788
npm run join -- --name Sam --code WL-XXXX --relay ws://127.0.0.1:7788
```

```
status
ping all
send README.md all
```

Check `incoming\`. Open `http://127.0.0.1:7788/` for the live peer table.

## Three real laptops

See [docs/SETUP.md](docs/SETUP.md). `wifi-lan> ping` and `send` work without Administrator. Windows Command Prompt `ping 10.77.0.x` needs **Administrator** so WinTUN can create the Wifi_LAN adapter.

USB handoff zip:

```bat
npm run pack
```

Share `wifi-lan-handoff.zip`. Teammates unzip, `npm install`, join.

## Extra flags

| Flag | Where | Meaning |
|------|--------|---------|
| `--max-peers N` | relay | Raise cap (default 3, max 32) |
| `--no-tun` | join | Skip WinTUN adapter (still have overlay ICMP ping + files) |
| `--incoming DIR` | join | Receive folder |

Sleep/Wi-Fi drop: the client **auto-reconnects** (1s, 2s, 5s; up to 10 tries) with the same name.

## Docs pipeline

| File | Role |
|------|------|
| `docs/prompt.md` | Raw intent |
| `docs/prompts.md` | Vision-generation prompt |
| `docs/vision.md` | Product vision |
| `docs/spec.md` | Engineering spec |
| `docs/backlog.md` | Epics / sprints |
| `docs/issues.json` | Importable issues |
