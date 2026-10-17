import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import {
  decodeChunk,
  encodeChunk,
  hashAndSize,
  IncomingTransfer,
  readChunks,
  sendWs,
} from "./client/files.ts";
import { startRelay } from "./relay/server.ts";
import { newNonce } from "./shared/ids.ts";
import {
  buildIcmpEchoRequest,
  icmpEchoIdSeq,
  icmpEchoReply,
  unwrapIp,
  wrapIp,
} from "./shared/ip.ts";
import { parseMessage, serialize, type Peer, type WireMessage } from "./shared/protocol.ts";

interface Headless {
  name: string;
  incoming: string;
  ws: WebSocket;
  self?: Peer;
  peers: Peer[];
  pending: Map<string, (msg: WireMessage) => void>;
  transfers: Map<string, IncomingTransfer>;
  icmpReplies: number;
}

export async function runDemo(port = 7789): Promise<void> {
  const relay = startRelay({ port, maxPeers: 3 });
  const base = await mkdtemp(path.join(os.tmpdir(), "wifi-lan-demo-"));
  const payload = path.join(base, "app-build.zip");
  await writeFile(payload, "demo-build-bytes");

  const names = ["Maya", "Jordan", "Sam"] as const;
  const clients: Headless[] = [];
  try {
    for (const name of names) {
      const incoming = path.join(base, name);
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      await waitOpen(ws);
      const c: Headless = {
        name,
        incoming,
        ws,
        peers: [],
        pending: new Map(),
        transfers: new Map(),
        icmpReplies: 0,
      };
      attach(c);
      ws.send(serialize({ v: 1, type: "join", code: relay.room.code, name }));
      await waitWelcome(c);
      clients.push(c);
    }

    await sleep(200);
    const maya = clients[0];
    const nonce = newNonce();
    const pingWait = waitType(clients[0], "pong", 3_000);
    maya.ws.send(
      serialize({
        v: 1,
        type: "ping",
        from: maya.self!.id,
        to: "all",
        nonce,
        ts: Date.now(),
      }),
    );
    await pingWait;

    const jordan = clients[1];
    maya.ws.send(
      wrapIp(
        buildIcmpEchoRequest(maya.self!.overlayIp, jordan.self!.overlayIp, 42, 1),
      ),
    );
    const icmpDeadline = Date.now() + 3000;
    while (maya.icmpReplies < 1 && Date.now() < icmpDeadline) {
      await sleep(40);
    }
    if (maya.icmpReplies < 1) {
      throw new Error("ICMP echo timed out");
    }

    const { sha256, size } = await hashAndSize(payload);
    const transferId = newNonce();
    maya.ws.send(
      serialize({
        v: 1,
        type: "file-meta",
        from: maya.self!.id,
        to: "all",
        name: "app-build.zip",
        size,
        sha256,
        transferId,
      }),
    );
    for await (const chunk of readChunks(payload)) {
      await sendWs(maya.ws, encodeChunk(transferId, chunk));
    }
    maya.ws.send(serialize({ v: 1, type: "file-done", transferId, ok: true }));

    await sleep(800);
    for (const c of clients.slice(1)) {
      const dest = path.join(c.incoming, "app-build.zip");
      const body = await readFile(dest, "utf8");
      if (body !== "demo-build-bytes") {
        throw new Error(`missing file for ${c.name}`);
      }
    }
    console.log("demo ok: 3 peers, ICMP ping, file in incoming/");
    console.log(`room ${relay.room.code}  status http://127.0.0.1:${port}/`);
  } finally {
    for (const c of clients) {
      try {
        c.ws.close();
      } catch {
        /* ignore */
      }
    }
    await relay.close();
  }
}

function attach(c: Headless): void {
  c.ws.on("message", (data, isBinary) => {
    if (isBinary) {
      const buf = Buffer.from(data as Buffer);
      const ip = unwrapIp(buf);
      if (ip) {
        const info = icmpEchoIdSeq(ip);
        if (info?.type === 8) {
          const reply = icmpEchoReply(ip);
          if (reply) c.ws.send(wrapIp(reply));
        }
        if (info?.type === 0) c.icmpReplies += 1;
        return;
      }
      const decoded = decodeChunk(buf);
      if (!decoded) return;
      const xfer = c.transfers.get(decoded.transferId);
      xfer?.write(decoded.payload);
      return;
    }
    const msg = parseMessage(String(data));
    if (msg.type === "welcome") {
      c.self = msg.self;
      c.peers = msg.peers;
    }
    if (msg.type === "ping" && c.self && (msg.to === "all" || msg.to === c.self.id)) {
      c.ws.send(
        serialize({
          v: 1,
          type: "pong",
          from: c.self.id,
          to: msg.from,
          nonce: msg.nonce,
          ts: Date.now(),
        }),
      );
    }
    if (msg.type === "peer-list") c.peers = msg.peers;
    if (msg.type === "file-meta") {
      const xfer = new IncomingTransfer(msg.transferId, msg.name, msg.size, msg.sha256, c.incoming);
      c.transfers.set(msg.transferId, xfer);
    }
    if (msg.type === "file-done") {
      const xfer = c.transfers.get(msg.transferId);
      void xfer?.finish();
    }
    for (const fn of c.pending.values()) fn(msg);
  });
}

function waitWelcome(c: Headless): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${c.name} no welcome`)), 4000);
    const id = newNonce();
    c.pending.set(id, (msg) => {
      if (msg.type === "welcome") {
        clearTimeout(t);
        c.pending.delete(id);
        resolve();
      }
      if (msg.type === "error") {
        clearTimeout(t);
        c.pending.delete(id);
        reject(new Error(msg.message));
      }
    });
  });
}

function waitType(c: Headless, type: WireMessage["type"], ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting ${type}`)), ms);
    const id = newNonce();
    c.pending.set(id, (msg) => {
      if (msg.type === type) {
        clearTimeout(t);
        c.pending.delete(id);
        resolve();
      }
    });
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
