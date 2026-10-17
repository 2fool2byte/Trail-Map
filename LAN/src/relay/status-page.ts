import type { Room } from "./room.ts";

export function renderStatusHtml(room: Room, topology: string, port: number): string {
  const rows = room
    .list()
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.light)}</td><td>${escapeHtml(p.overlayIp)}</td><td>${escapeHtml(p.name)}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="2" />
  <title>Wifi_LAN ${escapeHtml(room.code)}</title>
  <style>
    body { font-family: Segoe UI, sans-serif; margin: 2rem; background: #111; color: #eee; }
    table { border-collapse: collapse; }
    td, th { border: 1px solid #444; padding: 0.4rem 0.8rem; text-align: left; }
    .muted { color: #aaa; }
  </style>
</head>
<body>
  <h1>Wifi_LAN switch</h1>
  <p>Room <strong>${escapeHtml(room.code)}</strong> · ${room.list().length}/${room.maxPeers} peers · topology: ${escapeHtml(topology)}</p>
  <p class="muted">Relay port ${port}. This page is local status only — not a campus AP.</p>
  <table>
    <thead><tr><th>light</th><th>overlay</th><th>name</th></tr></thead>
    <tbody>${rows || "<tr><td colspan=3>waiting for joins</td></tr>"}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
