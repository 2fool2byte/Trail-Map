import { newPeerId, newRoomCode } from "../shared/ids.ts";
import {
  ABSOLUTE_MAX_PEERS,
  DEFAULT_MAX_PEERS,
  overlayIpForSlot,
  type Peer,
} from "../shared/protocol.ts";
import { lightFromLastSeen } from "../shared/status.ts";

export class RoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoomError";
  }
}

export class Room {
  readonly code: string;
  readonly maxPeers: number;
  private readonly peers = new Map<string, Peer>();

  constructor(codeOrOpts?: string | { code?: string; maxPeers?: number }) {
    if (typeof codeOrOpts === "string" || codeOrOpts === undefined) {
      this.code = codeOrOpts ?? newRoomCode();
      this.maxPeers = DEFAULT_MAX_PEERS;
    } else {
      this.code = codeOrOpts.code ?? newRoomCode();
      const n = codeOrOpts.maxPeers ?? DEFAULT_MAX_PEERS;
      if (n < 1 || n > ABSOLUTE_MAX_PEERS) {
        throw new RoomError(`max peers must be 1–${ABSOLUTE_MAX_PEERS}`);
      }
      this.maxPeers = n;
    }
  }

  list(): Peer[] {
    return [...this.peers.values()];
  }

  get(id: string): Peer | undefined {
    return this.peers.get(id);
  }

  findByName(name: string): Peer | undefined {
    const needle = name.trim().toLowerCase();
    return this.list().find((p) => p.name.toLowerCase() === needle);
  }

  join(name: string, now = Date.now()): { peer: Peer; rejoin: boolean } {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new RoomError("name is required");
    }
    const existing = this.findByName(trimmed);
    if (existing) {
      existing.lastSeen = now;
      existing.light = "connected";
      return { peer: existing, rejoin: true };
    }
    if (this.peers.size >= this.maxPeers) {
      throw new RoomError(`room full (max ${this.maxPeers})`);
    }
    const used = new Set(this.list().map((p) => p.overlayIp));
    let overlayIp = "";
    for (let slot = 1; slot <= this.maxPeers; slot++) {
      const ip = overlayIpForSlot(slot);
      if (!used.has(ip)) {
        overlayIp = ip;
        break;
      }
    }
    if (!overlayIp) {
      throw new RoomError(`room full (max ${this.maxPeers})`);
    }
    const peer: Peer = {
      id: newPeerId(),
      name: trimmed,
      overlayIp,
      light: "connected",
      lastSeen: now,
    };
    this.peers.set(peer.id, peer);
    return { peer, rejoin: false };
  }

  touch(id: string, now = Date.now()): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.lastSeen = now;
    peer.light = lightFromLastSeen(peer.lastSeen, now);
  }

  refreshLights(now = Date.now()): { changed: boolean; isolated: Peer[] } {
    const isolated: Peer[] = [];
    let changed = false;
    for (const peer of this.peers.values()) {
      const next = lightFromLastSeen(peer.lastSeen, now);
      if (next !== peer.light) {
        peer.light = next;
        changed = true;
      }
      if (next === "isolated") isolated.push(peer);
    }
    return { changed, isolated };
  }

  leave(id: string): Peer | undefined {
    const peer = this.peers.get(id);
    if (!peer) return undefined;
    this.peers.delete(id);
    return peer;
  }
}
