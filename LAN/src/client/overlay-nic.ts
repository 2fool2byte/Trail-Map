import {
  buildIcmpEchoRequest,
  icmpEchoIdSeq,
  icmpEchoReply,
  unwrapIp,
  wrapIp,
} from "../shared/ip.ts";
import type { OverlayNic } from "./wintun.ts";

export interface OverlayNet {
  sendIcmpEcho(destIp: string, id: number, seq: number): Buffer;
  handleIncoming(buf: Buffer): boolean;
  close(): void;
  tunReady: boolean;
}

export async function startOverlayNet(opts: {
  selfIp: string;
  sendFrame: (frame: Buffer) => void;
  onEchoReply: (fromIp: string, id: number, seq: number) => void;
  wantTun: boolean;
}): Promise<OverlayNet> {
  let nic: OverlayNic | undefined;
  let tunReady = false;

  const onTunPacket = (packet: Buffer) => {
    opts.sendFrame(wrapIp(packet));
  };

  if (opts.wantTun && process.platform === "win32") {
    try {
      const { openWindowsTun } = await import("./wintun.ts");
      nic = await openWindowsTun(opts.selfIp, onTunPacket);
      tunReady = true;
      console.log(`TUN up: ${opts.selfIp}/24 on adapter Wifi_LAN (Windows ping is live)`);
    } catch (err) {
      console.log(`TUN not available: ${(err as Error).message}`);
      console.log("Run join as Administrator for `ping 10.77.0.x` in Command Prompt.");
      console.log("wifi-lan> ping still uses real ICMP over the overlay without Admin.");
    }
  } else if (opts.wantTun && process.platform !== "win32") {
    console.log("TUN adapter is implemented for Windows; using overlay ICMP ping.");
  }

  return {
    tunReady,
    sendIcmpEcho(destIp: string, id: number, seq: number) {
      const packet = buildIcmpEchoRequest(opts.selfIp, destIp, id, seq);
      opts.sendFrame(wrapIp(packet));
      return packet;
    },
    handleIncoming(buf: Buffer) {
      const packet = unwrapIp(buf);
      if (!packet) return false;
      const info = icmpEchoIdSeq(packet);
      if (nic) {
        nic.inject(packet);
      } else if (info?.type === 8) {
        const reply = icmpEchoReply(packet);
        if (reply) opts.sendFrame(wrapIp(reply));
      }
      if (info?.type === 0) {
        const from = `${packet[12]}.${packet[13]}.${packet[14]}.${packet[15]}`;
        opts.onEchoReply(from, info.id, info.seq);
      }
      return true;
    },
    close() {
      nic?.close();
    },
  };
}
