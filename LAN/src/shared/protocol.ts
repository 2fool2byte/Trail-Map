import type { Light } from "./status.ts";

export type OverlayIp = string;

export interface Peer {
  id: string;
  name: string;
  overlayIp: OverlayIp;
  light: Light;
  lastSeen: number;
}

export type WireMessage =
  | { v: 1; type: "join"; code: string; name: string }
  | { v: 1; type: "welcome"; self: Peer; peers: Peer[]; topology: string }
  | { v: 1; type: "peer-list"; peers: Peer[] }
  | { v: 1; type: "hello"; from: string; ts: number }
  | { v: 1; type: "ping"; from: string; to: string | "all"; nonce: string; ts: number }
  | { v: 1; type: "pong"; from: string; to: string; nonce: string; ts: number }
  | { v: 1; type: "say"; from: string; text: string }
  | {
      v: 1;
      type: "file-meta";
      from: string;
      to: string | "all";
      name: string;
      size: number;
      sha256: string;
      transferId: string;
    }
  | { v: 1; type: "file-done"; transferId: string; ok: boolean; error?: string }
  | { v: 1; type: "error"; message: string };

const TYPES = new Set([
  "join",
  "welcome",
  "peer-list",
  "hello",
  "ping",
  "pong",
  "say",
  "file-meta",
  "file-done",
  "error",
]);

export function serialize(message: WireMessage): string {
  return JSON.stringify(message);
}

export function parseMessage(raw: string): WireMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("message must be an object");
  }
  const msg = parsed as { v?: unknown; type?: unknown };
  if (msg.v !== 1) {
    throw new Error("unsupported protocol version");
  }
  if (typeof msg.type !== "string" || !TYPES.has(msg.type)) {
    throw new Error("unknown message type");
  }
  return parsed as WireMessage;
}

export const MAX_FILE_BYTES = 512 * 1024 * 1024;
export const CHUNK_BYTES = 256 * 1024;
export const DEFAULT_MAX_PEERS = 3;
export const ABSOLUTE_MAX_PEERS = 32;

export function overlayIpForSlot(slot: number): OverlayIp {
  if (slot < 1 || slot > 253) {
    throw new Error("overlay slot out of range");
  }
  return `10.77.0.${slot}`;
}
