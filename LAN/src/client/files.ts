import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { decodeChunk, encodeChunk } from "../shared/chunk.ts";
import { CHUNK_BYTES, MAX_FILE_BYTES } from "../shared/protocol.ts";
import type { WebSocket } from "ws";

export { decodeChunk, encodeChunk };

export async function hashAndSize(filePath: string): Promise<{ sha256: string; size: number }> {
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new Error("not a file");
  }
  if (info.size > MAX_FILE_BYTES) {
    throw new Error(`file exceeds ${MAX_FILE_BYTES} byte limit`);
  }
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return { sha256: hash.digest("hex"), size: info.size };
}

export async function* readChunks(filePath: string): AsyncGenerator<Buffer> {
  const stream = createReadStream(filePath, { highWaterMark: CHUNK_BYTES });
  for await (const chunk of stream) {
    yield chunk as Buffer;
  }
}


export function sendWs(ws: WebSocket, data: Buffer | string): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.send(data, (err) => (err ? reject(err) : resolve()));
  });
}

export class IncomingTransfer {
  private readonly hash = createHash("sha256");
  private received = 0;
  private stream: ReturnType<typeof createWriteStream> | null = null;
  readonly dest: string;

  constructor(
    readonly transferId: string,
    readonly fileName: string,
    readonly size: number,
    readonly sha256: string,
    incomingDir: string,
  ) {
    const safe = path.basename(fileName).replace(/[<>:"|?*]/g, "_") || "file.bin";
    this.dest = path.join(incomingDir, safe);
    mkdirSync(incomingDir, { recursive: true });
    this.stream = createWriteStream(this.dest);
  }

  async open(): Promise<void> {
    /* stream opened in constructor so chunks cannot race */
  }

  write(payload: Buffer): void {
    if (!this.stream) throw new Error("transfer not open");
    this.received += payload.length;
    if (this.received > this.size) {
      throw new Error("received more bytes than advertised");
    }
    this.hash.update(payload);
    this.stream.write(payload);
  }

  async finish(): Promise<{ dest: string; sha256: string; ok: boolean }> {
    await new Promise<void>((resolve, reject) => {
      if (!this.stream) {
        resolve();
        return;
      }
      this.stream.end(() => resolve());
      this.stream.on("error", reject);
    });
    const digest = this.hash.digest("hex");
    const ok = digest === this.sha256 && this.received === this.size;
    return { dest: this.dest, sha256: digest, ok };
  }
}
