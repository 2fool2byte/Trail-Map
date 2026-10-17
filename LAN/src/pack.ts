import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function packProject(outFile: string): Promise<string> {
  const dest = path.resolve(outFile);
  await mkdir(path.dirname(dest), { recursive: true });
  await runTar(dest);
  return dest;
}

function runTar(dest: string): Promise<void> {
  const args = [
    "-a",
    "-cf",
    dest,
    "--exclude=node_modules",
    "--exclude=.git",
    "--exclude=incoming/*",
    "--exclude=*.zip",
    "-C",
    ROOT,
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "README.md",
    "START_HERE.txt",
    "src",
    "docs",
    "test",
    "incoming",
    "native",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, { stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited ${code}`));
    });
  });
}
