import path from "node:path";
import { runClient } from "./client/session.ts";
import { packProject } from "./pack.ts";
import { printRelayBanner, startRelay } from "./relay/server.ts";
import { ABSOLUTE_MAX_PEERS, DEFAULT_MAX_PEERS } from "./shared/protocol.ts";
import { runDemo } from "./demo.ts";

function usage(): string {
  return `Wifi_LAN — virtual switch for laptops on isolated guest Wi-Fi

Usage:
  npx tsx src/cli.ts relay [--port 7788] [--max-peers 3]
  npx tsx src/cli.ts join --name NAME --code CODE --relay ws://HOST:PORT [--incoming DIR] [--no-tun]
  npx tsx src/cli.ts demo
  npx tsx src/cli.ts pack [--out wifi-lan-handoff.zip]

npm:
  npm run relay
  npm run join -- --name Dana --code WL-XXXX --relay ws://127.0.0.1:7788
  npm run demo
  npm run pack

Incoming files default to ./incoming
Join tries to raise a Wifi_LAN TUN adapter (Administrator) so Windows ping 10.77.0.x works.
Without Admin, wifi-lan> ping still sends real ICMP over the overlay. --no-tun skips the adapter.
`;
}

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  return args[i + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    console.log(usage());
    return;
  }

  const cmd = args[0];

  if (cmd === "relay") {
    const port = Number(argValue(args, "--port") ?? process.env.WIFI_LAN_PORT ?? 7788);
    const maxPeers = Number(argValue(args, "--max-peers") ?? process.env.WIFI_LAN_MAX_PEERS ?? DEFAULT_MAX_PEERS);
    if (!Number.isFinite(port) || port < 1) {
      console.error("invalid --port");
      process.exitCode = 1;
      return;
    }
    if (!Number.isFinite(maxPeers) || maxPeers < 1 || maxPeers > ABSOLUTE_MAX_PEERS) {
      console.error(`--max-peers must be 1–${ABSOLUTE_MAX_PEERS}`);
      process.exitCode = 1;
      return;
    }
    const { room } = startRelay({ port, maxPeers });
    printRelayBanner(room, port);
    await hang();
    return;
  }

  if (cmd === "join") {
    const name = argValue(args, "--name");
    const code = argValue(args, "--code");
    const relay = argValue(args, "--relay") ?? "ws://127.0.0.1:7788";
    const incoming = argValue(args, "--incoming") ?? path.resolve("incoming");
    const tun = !hasFlag(args, "--no-tun");
    if (!name || !code) {
      console.error("join requires --name and --code");
      console.log(usage());
      process.exitCode = 1;
      return;
    }
    await runClient({ name, code, relay, incoming, tun });
    return;
  }

  if (cmd === "demo") {
    await runDemo();
    return;
  }

  if (cmd === "pack") {
    const out = argValue(args, "--out") ?? path.resolve("wifi-lan-handoff.zip");
    const dest = await packProject(out);
    console.log(`packed ${dest}`);
    return;
  }

  console.log(usage());
  process.exitCode = 1;
}

function hang(): Promise<void> {
  return new Promise(() => {
    /* relay until Ctrl+C */
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
