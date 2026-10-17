# Wifi_LAN setup (teammates)

URI **guest Wi-Fi blocks laptop-to-laptop traffic**. Wifi_LAN does not turn that off. All PCs connect **out** to one **relay** (usually the lead laptop). If you cannot reach the lead’s IP on guest Wi-Fi, use the **hotspot fallback**.

## Prerequisites

- Windows 10/11
- [Node.js 20 LTS](https://nodejs.org/) (`node -v` should print v20+)
- Unzipped Wifi_LAN folder (or `wifi-lan-handoff.zip` from `npm run pack`)

## 1. Finish guest login first

Open a browser, complete the URI guest captive portal, then come back here.

## 2. Install once

```bat
cd path\to\Wifi_LAN
npm install
```

## 3. Lead starts the relay

```bat
npm run relay
```

Default is **3 peers**. For a larger room:

```bat
npm run relay -- --max-peers 6
```

Copy:

- **Room code** (example `WL-7K2P`)
- A **join URL** teammates can actually route to
- Optional status page: `http://LEAD_IP:7788/`

`ws://127.0.0.1:7788` only works on the same PC. Other laptops need the hotspot/LAN address, e.g. `ws://192.168.137.1:7788`.

If Windows Firewall pops up, allow Node on **private** networks. The relay also prints an optional Admin `netsh advfirewall` command. Guest-looking `10.x` bind addresses are warned — prefer hotspot `192.168.137.x`.

## 4. Everyone joins

```bat
npm run join -- --name Dana --code WL-7K2P --relay ws://LEAD_IP:7788
```

Use your own display name. Wait until the table shows **connected** peers.

Same name can **rejoin** after a drop (auto-reconnect tries 1s / 2s / 5s, up to 10 times).

For **Command Prompt `ping 10.77.0.x`**, open **Command Prompt as Administrator** before `join`. Wifi_LAN will try to create a `Wifi_LAN` adapter and download WinTUN (GPL, from wintun.net) the first time.

## 5. Prove connectivity and exchange files

In the wifi-lan prompt (works without Admin):

```
status
ping all
send notes.txt all
send app-build.zip all
```

`ping` sends **real ICMP echo** over the overlay (Reply from 10.77.0.x / time=Nms). That is what the team app can rely on for “are you up?”

If TUN came up, a **second** Command Prompt on each laptop:

```
ping 10.77.0.1
ping 10.77.0.2
ping 10.77.0.3
```

Use the overlay column from `status` (not the guest Wi-Fi address). Guest `ping` to a teammate’s campus IP can still **fail**.

Files are sent in **256 KiB chunks** (max 512 MB). Received files land in `incoming\` (or `--incoming`). Confirm the printed sha256 before you run anything.

## Fallback: hotspot / USB (when guest isolation wins)

1. Lead: Windows **Mobile hotspot** (or a phone hotspot, or USB Ethernet).
2. Other two join **that** SSID/LAN, not only URI guest.
3. Lead runs `npm run relay` again and shares the **hotspot adapter IP**.
4. Join with that `ws://…` URL.

Do **not** try to “hack” client isolation or spoof the campus AP. If the relay IP is a guest address and joins hang, switch to hotspot.

## TUN / Windows ping (Administrator)

Join already tries WinTUN. To skip the adapter:

```bat
npm run join -- --name Dana --code WL-7K2P --relay ws://LEAD_IP:7788 --no-tun
```

TUN puts `10.77.0.x` on a virtual NIC. Packets still ride the **relay** (or hotspot path to the relay). It does not disable URI guest isolation.

## Sleep / Wi-Fi drop

Stay in the join window; Wifi_LAN reconnects automatically. If it gives up, run `join` again with the **same name and code**.

## Trust

Wifi_LAN does not run received files. Check the printed sha256, then copy into the hackathon app yourself.
