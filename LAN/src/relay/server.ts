import http from "node:http";
import os from "node:os";
import { WebSocket, WebSocketServer } from "ws";
import { warnBindAddresses } from "../shared/netwarn.ts";
import { decodeChunk } from "../shared/chunk.ts";
import { ipv4Dest, isBroadcastIp, unwrapIp } from "../shared/ip.ts";
import {
  DEFAULT_MAX_PEERS,
  parseMessage,
  serialize,
  type WireMessage,
} from "../shared/protocol.ts";
import { Room, RoomError } from "./room.ts";
import { renderStatusHtml } from "./status-page.ts";

type SocketState = { peerId?: string };
const HEARTBEAT_MS = 2_000;
const DROP_AFTER_MS = 20_000;

export function advertisedUrls(port: number): string[] {
  const urls = [`ws://127.0.0.1:${port}`];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      urls.push(`ws://${addr.address}:${port}`);
    }
  }
  return urls;
}

export interface RelayOptions {
  port: number;
  maxPeers?: number;
}

export function startRelay(opts: RelayOptions | number): { close: () => Promise<void>; room: Room; port: number } {
  const port = typeof opts === "number" ? opts : opts.port;
  const maxPeers = typeof opts === "number" ? DEFAULT_MAX_PEERS : (opts.maxPeers ?? DEFAULT_MAX_PEERS);
  const room = new Room({ maxPeers });
  const sockets = new Map<WebSocket, SocketState>();
  const transfers = new Map<string, { from: string; to: string | "all" }>();
  const topology = "relay";

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/" || url.startsWith("/status")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderStatusHtml(room, topology, port));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end(
      `Wifi_LAN relay\nroom ${room.code}\npeers ${room.list().length}/${room.maxPeers}\ntopology: ${topology}\n`,
    );
  });

  const wss = new WebSocketServer({ server });

  const broadcastPeerList = () => {
    const payload = serialize({ v: 1, type: "peer-list", peers: room.list() });
    for (const [ws, state] of sockets) {
      if (state.peerId && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  };

  const sendJson = (ws: WebSocket, message: WireMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialize(message));
    }
  };

  const forward = (fromId: string, target: string | "all", message: WireMessage | Buffer) => {
    for (const [ws, state] of sockets) {
      if (!state.peerId || state.peerId === fromId) continue;
      if (target !== "all" && state.peerId !== target) continue;
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (Buffer.isBuffer(message)) ws.send(message);
      else sendJson(ws, message);
    }
  };

  const dropSocketForPeer = (peerId: string, except?: WebSocket) => {
    for (const [ws, state] of sockets) {
      if (state.peerId === peerId && ws !== except) {
        ws.close();
      }
    }
  };

  const beat = setInterval(() => {
    const now = Date.now();
    const { changed, isolated } = room.refreshLights(now);
    for (const peer of isolated) {
      if (now - peer.lastSeen >= DROP_AFTER_MS) {
        dropSocketForPeer(peer.id);
        room.leave(peer.id);
        console.log(`[isolated] dropped ${peer.name}`);
      }
    }
    if (changed || isolated.length) broadcastPeerList();
  }, HEARTBEAT_MS);

  wss.on("connection", (ws) => {
    sockets.set(ws, {});

    ws.on("message", (data, isBinary) => {
      const state = sockets.get(ws);
      if (!state) return;

      if (isBinary) {
        if (!state.peerId) return;
        room.touch(state.peerId);
        const buf = Buffer.from(data as Buffer);
        const ip = unwrapIp(buf);
        if (ip) {
          const destIp = ipv4Dest(ip);
          if (!destIp) return;
          if (isBroadcastIp(destIp)) {
            forward(state.peerId, "all", buf);
            return;
          }
          const peer = room.list().find((p) => p.overlayIp === destIp);
          if (peer) forward(state.peerId, peer.id, buf);
          return;
        }
        const decoded = decodeChunk(buf);
        const dest = decoded ? transfers.get(decoded.transferId) : undefined;
        forward(state.peerId, dest?.to ?? "all", buf);
        return;
      }

      let msg: WireMessage;
      try {
        msg = parseMessage(String(data));
      } catch (err) {
        sendJson(ws, { v: 1, type: "error", message: (err as Error).message });
        return;
      }

      if (msg.type === "join") {
        if (state.peerId) {
          sendJson(ws, { v: 1, type: "error", message: "already joined" });
          return;
        }
        if (msg.code.trim().toUpperCase() !== room.code.toUpperCase()) {
          sendJson(ws, { v: 1, type: "error", message: "invalid room code" });
          ws.close();
          return;
        }
        try {
          const { peer, rejoin } = room.join(msg.name);
          if (rejoin) dropSocketForPeer(peer.id, ws);
          state.peerId = peer.id;
          sendJson(ws, {
            v: 1,
            type: "welcome",
            self: peer,
            peers: room.list(),
            topology,
          });
          broadcastPeerList();
          console.log(
            `[join] ${peer.name} ${peer.overlayIp} (${room.list().length}/${room.maxPeers})${rejoin ? " rejoin" : ""}`,
          );
        } catch (err) {
          const message = err instanceof RoomError ? err.message : "join failed";
          sendJson(ws, { v: 1, type: "error", message });
          ws.close();
        }
        return;
      }

      if (!state.peerId) {
        sendJson(ws, { v: 1, type: "error", message: "join first" });
        return;
      }

      room.touch(state.peerId);
      const from = state.peerId;

      if (msg.type === "hello") {
        return;
      }
      if (msg.type === "ping") {
        forward(from, msg.to, { ...msg, from });
        return;
      }
      if (msg.type === "pong") {
        forward(from, msg.to, { ...msg, from });
        return;
      }
      if (msg.type === "say") {
        forward(from, "all", { ...msg, from, text: msg.text.slice(0, 280) });
        return;
      }
      if (msg.type === "file-meta") {
        transfers.set(msg.transferId, { from, to: msg.to });
        forward(from, msg.to, { ...msg, from });
        return;
      }
      if (msg.type === "file-done") {
        const dest = transfers.get(msg.transferId);
        forward(from, dest?.to ?? "all", msg);
        transfers.delete(msg.transferId);
        return;
      }
    });

    ws.on("close", () => {
      const state = sockets.get(ws);
      sockets.delete(ws);
      if (state?.peerId) {
        const still = [...sockets.values()].some((s) => s.peerId === state.peerId);
        if (!still) {
          const left = room.leave(state.peerId);
          if (left) {
            console.log(`[leave] ${left.name}`);
            broadcastPeerList();
          }
        }
      }
    });
  });

  server.listen(port, "0.0.0.0");

  return {
    room,
    port,
    close: () =>
      new Promise((resolve, reject) => {
        clearInterval(beat);
        wss.close();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function printRelayBanner(room: Room, port: number): void {
  const urls = advertisedUrls(port);
  console.log("Wifi_LAN relay");
  console.log(`  room code : ${room.code}`);
  console.log(`  max peers : ${room.maxPeers}`);
  console.log("  topology  : relay (userspace, not guest L2)");
  console.log(`  status    : http://127.0.0.1:${port}/`);
  console.log("  join URLs :");
  for (const url of urls) {
    console.log(`    ${url}`);
  }
  console.log("");
  for (const line of warnBindAddresses(urls, port)) {
    console.log(line);
  }
  console.log("");
  console.log("If teammates cannot connect, the URL is probably a guest-isolated");
  console.log("address. Use a hotspot or USB Ethernet so they can reach this PC.");
  console.log(`Waiting for ${room.maxPeers} peers…`);
}
