export const WLIP_MAGIC = Buffer.from("WLIP");

export function wrapIp(packet: Buffer): Buffer {
  return Buffer.concat([WLIP_MAGIC, packet]);
}

export function unwrapIp(buf: Buffer): Buffer | null {
  if (buf.length < WLIP_MAGIC.length + 20) return null;
  if (!buf.subarray(0, WLIP_MAGIC.length).equals(WLIP_MAGIC)) return null;
  return buf.subarray(WLIP_MAGIC.length);
}

export function ipv4Dest(packet: Buffer): string | null {
  if (packet.length < 20 || packet[0] >> 4 !== 4) return null;
  return `${packet[16]}.${packet[17]}.${packet[18]}.${packet[19]}`;
}

export function ipv4Src(packet: Buffer): string | null {
  if (packet.length < 20 || packet[0] >> 4 !== 4) return null;
  return `${packet[12]}.${packet[13]}.${packet[14]}.${packet[15]}`;
}

export function isBroadcastIp(ip: string): boolean {
  return ip === "255.255.255.255" || ip.endsWith(".255");
}

export function parseIpv4(ip: string): Buffer {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => n < 0 || n > 255 || Number.isNaN(n))) {
    throw new Error(`invalid IPv4 ${ip}`);
  }
  return Buffer.from(parts);
}

export function internetChecksum(buf: Buffer): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i += 2) {
    const word = i + 1 < buf.length ? buf.readUInt16BE(i) : buf[i] << 8;
    sum += word;
  }
  while (sum > 0xffff) {
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  return ~sum & 0xffff;
}

export function buildIcmpEchoRequest(src: string, dest: string, id: number, seq: number, payload = "Wifi_LAN"): Buffer {
  const data = Buffer.from(payload);
  const icmp = Buffer.alloc(8 + data.length);
  icmp[0] = 8;
  icmp.writeUInt16BE(id & 0xffff, 4);
  icmp.writeUInt16BE(seq & 0xffff, 6);
  data.copy(icmp, 8);
  icmp.writeUInt16BE(internetChecksum(icmp), 2);

  const ip = Buffer.alloc(20 + icmp.length);
  ip[0] = 0x45;
  ip.writeUInt16BE(ip.length, 2);
  ip.writeUInt16BE(id & 0xffff, 4);
  ip[8] = 64;
  ip[9] = 1;
  parseIpv4(src).copy(ip, 12);
  parseIpv4(dest).copy(ip, 16);
  ip.writeUInt16BE(internetChecksum(ip.subarray(0, 20)), 10);
  icmp.copy(ip, 20);
  return ip;
}

export function icmpEchoReply(packet: Buffer): Buffer | null {
  const ihl = (packet[0] & 0x0f) * 4;
  if (packet.length < ihl + 8 || packet[9] !== 1) return null;
  if (packet[ihl] !== 8) return null;
  const out = Buffer.from(packet);
  packet.subarray(12, 16).copy(out, 16);
  packet.subarray(16, 20).copy(out, 12);
  out[8] = 64;
  out.writeUInt16BE(0, 10);
  out.writeUInt16BE(internetChecksum(out.subarray(0, 20)), 10);
  out[ihl] = 0;
  out.writeUInt16BE(0, ihl + 2);
  out.writeUInt16BE(internetChecksum(out.subarray(ihl)), ihl + 2);
  return out;
}

export function icmpEchoIdSeq(packet: Buffer): { id: number; seq: number; type: number } | null {
  const ihl = (packet[0] & 0x0f) * 4;
  if (packet.length < ihl + 8 || packet[9] !== 1) return null;
  return {
    type: packet[ihl],
    id: packet.readUInt16BE(ihl + 4),
    seq: packet.readUInt16BE(ihl + 6),
  };
}
