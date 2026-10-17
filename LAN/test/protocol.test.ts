import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMessage, serialize } from "../src/shared/protocol.ts";

test("round-trips join JSON", () => {
  const msg = { v: 1 as const, type: "join" as const, code: "WL-7K2P", name: "Maya" };
  const again = parseMessage(serialize(msg));
  assert.deepEqual(again, msg);
});

test("rejects unknown version", () => {
  assert.throws(() => parseMessage(JSON.stringify({ v: 2, type: "join" })), /version/);
});

test("rejects unknown type", () => {
  assert.throws(() => parseMessage(JSON.stringify({ v: 1, type: "explode" })), /unknown/);
});

test("rejects invalid JSON", () => {
  assert.throws(() => parseMessage("not-json"), /JSON/);
});
