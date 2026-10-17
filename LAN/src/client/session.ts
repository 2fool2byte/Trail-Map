import readline from "node:readline";
import { WebSocket } from "ws";
import { newNonce } from "../shared/ids.ts";
import {
  parseMessage,
  serialize,
  type Peer,
  type WireMessage,
} from "../shared/protocol.ts";
import {
  decodeChunk,
  encodeChunk,
  hashAndSize,
  IncomingTransfer,
  readChunks,
  sendWs,
} from "./files.ts";
import { startOverlayNet, type OverlayNet } from "./overlay-nic.ts";
import { printHelp, renderStatus } from "./ui.ts";

export interface JoinOptions {
  name: string;
  code: string;
  relay: string;
  incoming: string;
  tun?: boolean;
}

const BACKOFF_MS = [1_000, 2_000, 5_000];
const MAX_ATTEMPTS = 10;
const HELLO_MS = 3_000;

export async function runClient(opts: JoinOptions): Promise<void> {
  let stop = false;
  let ws: WebSocket | undefined;
  let self: Peer | undefined;
  let peers: Peer[] = [];
  let helloTimer: ReturnType<typeof setInterval> | undefined;
  const pendingPings = new Map<string, number>();
  const transfers = new Map<string, IncomingTransfer>();
  let overlay: OverlayNet | undefined;
  const pendingIcmp = new Map<string, { t0: number }>();
  let icmpId = (Date.now() & 0xffff) || 1;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("wifi-lan> ");

  const send = (message: WireMessage) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(serialize(message));
    } else {
      console.log("not connected (reconnecting…)");
    }
  };

  async function handleMessage(msg: WireMessage): Promise<void> {
    if (msg.type === "error") {
      console.log(`error: ${msg.message}`);
      return;
    }
    if (msg.type === "welcome") {
      self = msg.self;
      peers = msg.peers;
      console.log(`joined as ${self.name} (${self.overlayIp})`);
      console.log(`topology: ${msg.topology}`);
      if (!overlay) {
        overlay = await startOverlayNet({
          selfIp: self.overlayIp,
          wantTun: opts.tun !== false,
          sendFrame: (frame) => {
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(frame);
          },
          onEchoReply: (fromIp, id, seq) => {
            const key = `${id}:${seq}`;
            const pending = pendingIcmp.get(key);
            if (!pending) return;
            pendingIcmp.delete(key);
            console.log(`Reply from ${fromIp}: bytes=32 time=${Date.now() - pending.t0}ms TTL=64`);
            rl.prompt();
          },
        });
        if (overlay.tunReady) {
          console.log(`Command Prompt ping: ping ${self.overlayIp}  (others use the overlay column)`);
        }
      }
      console.log(renderStatus(self, peers));
      printHelp();
      rl.prompt();
      return;
    }
    if (msg.type === "peer-list") {
      peers = msg.peers;
      self = peers.find((p) => p.id === self?.id) ?? self;
      console.log(renderStatus(self, peers));
      rl.prompt();
      return;
    }
    if (msg.type === "ping" && self) {
      if (msg.to === "all" || msg.to === self.id) {
        send({
          v: 1,
          type: "pong",
          from: self.id,
          to: msg.from,
          nonce: msg.nonce,
          ts: Date.now(),
        });
      }
      return;
    }
    if (msg.type === "pong") {
      const started = pendingPings.get(msg.nonce);
      if (started !== undefined) {
        const from = peers.find((p) => p.id === msg.from);
        console.log(`overlay ping ${from?.name ?? msg.from}: ${Date.now() - started} ms`);
        pendingPings.delete(msg.nonce);
        rl.prompt();
      }
      return;
    }
    if (msg.type === "say") {
      const from = peers.find((p) => p.id === msg.from);
      console.log(`[${from?.name ?? "peer"}] ${msg.text}`);
      rl.prompt();
      return;
    }
    if (msg.type === "file-meta" && self) {
      const forMe = msg.to === "all" || msg.to === self.id;
      if (!forMe) return;
      const xfer = new IncomingTransfer(
        msg.transferId,
        msg.name,
        msg.size,
        msg.sha256,
        opts.incoming,
      );
      await xfer.open();
      transfers.set(msg.transferId, xfer);
      const from = peers.find((p) => p.id === msg.from);
      console.log(`receiving ${msg.name} (${msg.size} bytes) from ${from?.name ?? "peer"}`);
      return;
    }
    if (msg.type === "file-done") {
      const xfer = transfers.get(msg.transferId);
      if (!xfer) return;
      const result = await xfer.finish();
      transfers.delete(msg.transferId);
      if (result.ok) {
        console.log(`received ${xfer.fileName} → ${result.dest} (sha256 ${result.sha256.slice(0, 12)}…)`);
      } else {
        console.log(`checksum mismatch for ${xfer.fileName}`);
      }
      rl.prompt();
    }
  }

  function attachSocket(socket: WebSocket): void {
    ws = socket;
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.from(data as Buffer);
        if (overlay?.handleIncoming(buf)) return;
        const decoded = decodeChunk(buf);
        if (!decoded) return;
        const xfer = transfers.get(decoded.transferId);
        if (!xfer) return;
        try {
          xfer.write(decoded.payload);
        } catch (err) {
          console.log(`file error: ${(err as Error).message}`);
        }
        return;
      }
      let msg: WireMessage;
      try {
        msg = parseMessage(String(data));
      } catch {
        return;
      }
      void handleMessage(msg);
    });
  }

  async function connectOnce(): Promise<void> {
    const socket = new WebSocket(opts.relay);
    await waitOpen(socket);
    attachSocket(socket);
    socket.send(serialize({ v: 1, type: "join", code: opts.code, name: opts.name }));
    helloTimer = setInterval(() => {
      if (self && socket.readyState === WebSocket.OPEN) {
        send({ v: 1, type: "hello", from: self.id, ts: Date.now() });
      }
    }, HELLO_MS);
    await waitClose(socket);
    if (helloTimer) clearInterval(helloTimer);
  }

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }
    const [cmd, ...rest] = splitArgs(trimmed);
    try {
      await handleCommand(cmd.toLowerCase(), rest);
    } catch (err) {
      console.log((err as Error).message);
    }
    if (!stop) rl.prompt();
  });

  async function handleCommand(cmd: string, args: string[]): Promise<void> {
    if (cmd === "help") {
      printHelp();
      return;
    }
    if (cmd === "quit" || cmd === "exit") {
      stop = true;
      overlay?.close();
      overlay = undefined;
      ws?.close();
      rl.close();
      return;
    }
    if (!self || !ws || ws.readyState !== WebSocket.OPEN) {
      console.log("still joining or reconnecting…");
      return;
    }
    if (cmd === "status") {
      console.log(renderStatus(self, peers));
      return;
    }
    if (cmd === "say") {
      send({ v: 1, type: "say", from: self.id, text: args.join(" ") });
      return;
    }
    if (cmd === "ping") {
      const targetName = args[0] ?? "all";
      const targets = resolvePingIps(targetName, peers, self);
      if (targets.length === 0) {
        console.log("no other peers yet");
        return;
      }
      if (!overlay) {
        console.log("overlay not ready");
        return;
      }
      for (const ip of targets) {
        console.log(`Pinging ${ip} with 32 bytes of data:`);
        for (let seq = 1; seq <= 4; seq++) {
          const id = icmpId;
          const key = `${id}:${seq}`;
          pendingIcmp.set(key, { t0: Date.now() });
          overlay.sendIcmpEcho(ip, id, seq);
          const start = Date.now();
          while (pendingIcmp.has(key) && Date.now() - start < 2000) {
            await sleep(40);
          }
          if (pendingIcmp.has(key)) {
            pendingIcmp.delete(key);
            console.log("Request timed out.");
          }
        }
        icmpId = (icmpId + 1) & 0xffff || 1;
      }
      return;
    }
    if (cmd === "send") {
      const filePath = args[0];
      if (!filePath) {
        console.log("usage: send <file> [name|all]");
        return;
      }
      const to = resolveTarget(args[1] ?? "all", peers, self);
      const { sha256, size } = await hashAndSize(filePath);
      const transferId = newNonce();
      const base = filePath.replace(/^.*[/\\]/, "");
      send({
        v: 1,
        type: "file-meta",
        from: self.id,
        to,
        name: base,
        size,
        sha256,
        transferId,
      });
      for await (const chunk of readChunks(filePath)) {
        await sendWs(ws, encodeChunk(transferId, chunk));
      }
      send({ v: 1, type: "file-done", transferId, ok: true });
      console.log(`sent ${base} (${size} bytes in ${Math.ceil(size / (256 * 1024)) || 1} chunks, sha256 ${sha256.slice(0, 12)}…)`);
      return;
    }
    console.log("unknown command; type help");
  }

  rl.prompt();

  let attempt = 0;
  while (!stop && attempt < MAX_ATTEMPTS) {
    try {
      console.log(attempt === 0 ? `connecting ${opts.relay}` : `reconnect ${attempt}/${MAX_ATTEMPTS} ${opts.relay}`);
      await connectOnce();
      if (stop) break;
      attempt += 1;
      self = self ? { ...self, light: "degraded" } : self;
      console.log("disconnected from relay (will retry)");
      await sleep(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]);
    } catch (err) {
      attempt += 1;
      console.log(`connect failed: ${(err as Error).message}`);
      if (attempt >= MAX_ATTEMPTS) break;
      await sleep(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]);
    }
  }

  if (!stop) {
    console.log("gave up reconnecting (isolated). Run join again.");
  }
  rl.close();
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (err) => reject(err));
  });
}

function waitClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    ws.once("close", () => resolve());
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function resolvePingIps(name: string, peers: Peer[], self: Peer): string[] {
  if (!name || name === "all") {
    return peers.filter((p) => p.id !== self.id).map((p) => p.overlayIp);
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) {
    return [name];
  }
  const found = peers.find(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== self.id,
  );
  if (!found) {
    throw new Error(`no peer named ${name}`);
  }
  return [found.overlayIp];
}

function resolveTarget(name: string, peers: Peer[], self: Peer): string | "all" {
  if (!name || name === "all") return "all";
  const found = peers.find(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== self.id,
  );
  if (!found) {
    throw new Error(`no peer named ${name}`);
  }
  return found.id;
}

function splitArgs(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote = false;
  for (const ch of line) {
    if (ch === '"') {
      quote = !quote;
      continue;
    }
    if (!quote && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
