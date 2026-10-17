import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface TunResult {
  ok: boolean;
  detail: string;
}

/**
 * Optional overlay IP on loopback. Does not install WinTUN or punch through
 * guest isolation. Hackathon apps can bind/connect to 10.77.0.x locally;
 * packets between laptops still use the WebSocket relay.
 */
export async function bindOverlayLoopback(overlayIp: string): Promise<TunResult> {
  try {
    if (process.platform === "win32") {
      await execFileAsync(
        "netsh",
        [
          "interface",
          "ipv4",
          "add",
          "address",
          "Loopback Pseudo-Interface 1",
          overlayIp,
          "255.255.255.0",
        ],
        { windowsHide: true },
      );
      return { ok: true, detail: `bound ${overlayIp} on Windows loopback (admin TUN mode)` };
    }
    await execFileAsync("ip", ["addr", "add", `${overlayIp}/24`, "dev", "lo"]);
    return { ok: true, detail: `bound ${overlayIp} on lo` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      detail: `TUN/loopback bind failed (need Administrator?): ${message}. Staying userspace-only.`,
    };
  }
}
