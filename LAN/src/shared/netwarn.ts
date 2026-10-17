const HOTSPOT_PREFIXES = ["192.168.137.", "192.168.43.", "192.168.0.", "192.168.1."];

export function looksLikeGuestSubnet(ipv4: string): boolean {
  if (ipv4 === "127.0.0.1") return false;
  if (HOTSPOT_PREFIXES.some((p) => ipv4.startsWith(p))) return false;
  const parts = ipv4.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function firewallHint(port: number): string {
  return [
    "Windows Firewall: allow Node.js on private networks, or run (Admin):",
    `  netsh advfirewall firewall add rule name="Wifi_LAN relay" dir=in action=allow protocol=TCP localport=${port}`,
  ].join("\n");
}

export function warnBindAddresses(urls: string[], port: number): string[] {
  const lines: string[] = [];
  for (const url of urls) {
    const host = url.replace(/^ws:\/\//, "").replace(/:\d+$/, "");
    if (looksLikeGuestSubnet(host)) {
      lines.push(
        `Warning: ${url} may be a campus/guest address. Teammates often cannot route to it. Prefer hotspot IP 192.168.137.x.`,
      );
    }
  }
  lines.push(firewallHint(port));
  return lines;
}
