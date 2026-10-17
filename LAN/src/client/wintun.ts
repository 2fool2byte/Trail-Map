import { execFile } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { chmod, copyFile, unlink } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { spawn } from "node:child_process";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DLL = path.join(ROOT, "native", "wintun.dll");
const ZIP_URL = "https://www.wintun.net/builds/wintun-0.14.1.zip";
const ADAPTER_NAME = "Wifi_LAN";

export interface OverlayNic {
  inject(packet: Buffer): void;
  close(): void;
}

export async function openWindowsTun(
  overlayIp: string,
  onPacket: (packet: Buffer) => void,
): Promise<OverlayNic> {
  if (process.platform !== "win32") {
    throw new Error("WinTUN is Windows-only");
  }
  await ensureWintunDll();
  const koffi = (await import("koffi")).default as {
    load: (p: string) => {
      func: (sig: string) => (...args: unknown[]) => unknown;
    };
  };
  const lib = koffi.load(DLL);
  const kernel32 = koffi.load("kernel32.dll");

  const CreateAdapter = lib.func("void *WintunCreateAdapter(str16 Name, str16 TunnelType, void *RequestedGUID)");
  const OpenAdapter = lib.func("void *WintunOpenAdapter(str16 Name)");
  const CloseAdapter = lib.func("void WintunCloseAdapter(void *Adapter)");
  const StartSession = lib.func("void *WintunStartSession(void *Adapter, uint32 Capacity)");
  const EndSession = lib.func("void WintunEndSession(void *Session)");
  const ReadEvent = lib.func("void *WintunGetReadWaitEvent(void *Session)");
  const ReceivePacket = lib.func("uint8 *WintunReceivePacket(void *Session, _Out_ uint32 *PacketSize)");
  const ReleasePacket = lib.func("void WintunReleaseReceivePacket(void *Session, uint8 *Packet)");
  const AllocSend = lib.func("uint8 *WintunAllocateSendPacket(void *Session, uint32 PacketSize)");
  const SendPacket = lib.func("void WintunSendPacket(void *Session, uint8 *Packet)");
  const Wait = kernel32.func("uint32 WaitForSingleObject(void *hHandle, uint32 dwMilliseconds)");
  const memcpy = kernel32.func("void *memcpy(void *dest, void *src, size_t n)");

  let adapter = OpenAdapter(ADAPTER_NAME) as unknown;
  if (!adapter) {
    adapter = CreateAdapter(ADAPTER_NAME, "Wifi_LAN", null);
  }
  if (!adapter) {
    throw new Error("WintunCreateAdapter failed — run Command Prompt as Administrator");
  }
  const session = StartSession(adapter, 0x200000);
  if (!session) {
    CloseAdapter(adapter);
    throw new Error("WintunStartSession failed");
  }

  await sleep(400);
  await assignIpv4(ADAPTER_NAME, overlayIp);
  await allowIcmp();

  let running = true;
  const waitHandle = ReadEvent(session);
  const loop = (async () => {
    while (running) {
      const sizeBox = [0];
      const ptr = ReceivePacket(session, sizeBox) as unknown;
      if (!ptr) {
        Wait(waitHandle, 250);
        continue;
      }
      const size = Number(sizeBox[0] ?? 0);
      if (size > 0 && size < 65535) {
        const buf = Buffer.alloc(size);
        memcpy(buf, ptr, size);
        onPacket(buf);
      }
      ReleasePacket(session, ptr);
    }
  })();
  void loop;

  return {
    inject(packet: Buffer) {
      if (!running || packet.length < 20) return;
      const dest = AllocSend(session, packet.length) as unknown;
      if (!dest) return;
      memcpy(dest, packet, packet.length);
      SendPacket(session, dest);
    },
    close() {
      running = false;
      try {
        EndSession(session);
      } catch {
        /* ignore */
      }
      try {
        CloseAdapter(adapter);
      } catch {
        /* ignore */
      }
    },
  };
}

async function assignIpv4(iface: string, ip: string): Promise<void> {
  let last = "";
  for (let i = 0; i < 8; i++) {
    try {
      await execFileAsync(
        "netsh",
        ["interface", "ipv4", "set", "address", `name=${iface}`, "source=static", `addr=${ip}`, "mask=255.255.255.0"],
        { windowsHide: true },
      );
      await execFileAsync(
        "netsh",
        ["interface", "ipv4", "set", "subinterface", iface, "mtu=1280", "store=active"],
        { windowsHide: true },
      );
      return;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      await sleep(250);
    }
  }
  throw new Error(`netsh set address failed: ${last}`);
}

async function allowIcmp(): Promise<void> {
  try {
    await execFileAsync(
      "netsh",
      [
        "advfirewall",
        "firewall",
        "add",
        "rule",
        "name=Wifi_LAN ICMPv4",
        "protocol=icmpv4:8,any",
        "dir=in",
        "action=allow",
      ],
      { windowsHide: true },
    );
  } catch {
    /* rule may already exist; ping can still work on Private profile */
  }
}

async function ensureWintunDll(): Promise<void> {
  if (existsSync(DLL)) return;
  mkdirSync(path.dirname(DLL), { recursive: true });
  const zip = path.join(os.tmpdir(), "wintun-0.14.1.zip");
  await download(ZIP_URL, zip);
  const extractDir = path.join(os.tmpdir(), "wintun-extract");
  mkdirSync(extractDir, { recursive: true });
  await tarExtract(zip, extractDir);
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const found = path.join(extractDir, "wintun", "bin", arch, "wintun.dll");
  if (!existsSync(found)) {
    throw new Error(`wintun.dll not in zip (${found})`);
  }
  await copyFile(found, DLL);
  try {
    await chmod(DLL, 0o644);
  } catch {
    /* windows */
  }
  try {
    await unlink(zip);
  } catch {
    /* ignore */
  }
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`download wintun ${res.statusCode}`));
          return;
        }
        pipeline(res, createWriteStream(dest)).then(resolve, reject);
      })
      .on("error", reject);
  });
}

function tarExtract(zip: string, dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xf", zip, "-C", dir], { windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar ${code}`))));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
