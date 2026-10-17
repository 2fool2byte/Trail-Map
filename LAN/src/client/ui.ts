import type { Peer } from "../shared/protocol.ts";

export function renderStatus(self: Peer | undefined, peers: Peer[]): string {
  const rows = peers.map((p) => {
    const you = self && p.id === self.id ? " (you)" : "";
    return `  ${p.light.padEnd(10)}  ${p.overlayIp.padEnd(11)}  ${p.name}${you}`;
  });
  const header = "  light       overlay      name";
  return ["Wifi_LAN switch", header, ...rows].join("\n");
}

export function printHelp(): void {
  console.log(`Commands:
  status                 show peer table
  ping [name|all|10.77.0.x]  ICMP echo (like Command Prompt ping)
  send <file> [name|all]     copy a build / info file
  say <text>             short team message
  help
  quit`);
}
