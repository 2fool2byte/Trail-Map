import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { decodeChunk, encodeChunk } from "../src/shared/chunk.ts";
import { IncomingTransfer } from "../src/client/files.ts";
import { newTransferId } from "../src/shared/ids.ts";
import { looksLikeGuestSubnet } from "../src/shared/netwarn.ts";
import { parseMessage, serialize } from "../src/shared/protocol.ts";

test("chunk encode/decode preserves uuid and payload", () => {
  const id = newTransferId();
  const payload = Buffer.from("hello-chunk");
  const decoded = decodeChunk(encodeChunk(id, payload));
  assert.equal(decoded?.transferId, id);
  assert.deepEqual(decoded?.payload, payload);
});

test("hello round-trips", () => {
  const msg = { v: 1 as const, type: "hello" as const, from: "abc", ts: 1 };
  assert.deepEqual(parseMessage(serialize(msg)), msg);
});

test("incoming transfer checksum", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wl-in-"));
  const id = newTransferId();
  const body = Buffer.from("zip-bytes");
  const xfer = new IncomingTransfer(id, "app-build.zip", body.length, "x", dir);
  xfer.write(body);
  const result = await xfer.finish();
  assert.equal(result.ok, false);
  const onDisk = await readFile(path.join(dir, "app-build.zip"));
  assert.deepEqual(onDisk, body);
});

test("incoming matching sha256", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wl-in-"));
  const { createHash } = await import("node:crypto");
  const body = Buffer.from("ok");
  const sha = createHash("sha256").update(body).digest("hex");
  const xfer = new IncomingTransfer(newTransferId(), "a.bin", 2, sha, dir);
  xfer.write(body);
  const result = await xfer.finish();
  assert.equal(result.ok, true);
});

test("guest subnet heuristic", () => {
  assert.equal(looksLikeGuestSubnet("127.0.0.1"), false);
  assert.equal(looksLikeGuestSubnet("192.168.137.1"), false);
  assert.equal(looksLikeGuestSubnet("10.32.4.8"), true);
});

test("writeFile smoke helper", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wl-w-"));
  await writeFile(path.join(dir, "x"), "y");
});
