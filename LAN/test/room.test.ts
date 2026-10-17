import assert from "node:assert/strict";
import { test } from "node:test";
import { Room, RoomError } from "../src/relay/room.ts";
import { lightFromLastSeen } from "../src/shared/status.ts";

test("three joins get overlay IPs in order", () => {
  const room = new Room("WL-TEST");
  const a = room.join("Maya").peer;
  const b = room.join("Jordan").peer;
  const c = room.join("Sam").peer;
  assert.equal(a.overlayIp, "10.77.0.1");
  assert.equal(b.overlayIp, "10.77.0.2");
  assert.equal(c.overlayIp, "10.77.0.3");
  assert.equal(room.list().length, 3);
});

test("fourth join is rejected", () => {
  const room = new Room();
  room.join("A");
  room.join("B");
  room.join("C");
  assert.throws(() => room.join("D"), RoomError);
  assert.throws(() => room.join("D"), /max 3/);
});

test("duplicate names rejoin instead of duplicating", () => {
  const room = new Room();
  const first = room.join("Maya");
  const again = room.join("maya");
  assert.equal(again.rejoin, true);
  assert.equal(again.peer.id, first.peer.id);
  assert.equal(room.list().length, 1);
});

test("empty name rejected", () => {
  const room = new Room();
  assert.throws(() => room.join("  "), /required/);
});

test("leave frees a slot", () => {
  const room = new Room();
  const a = room.join("Maya").peer;
  room.join("Jordan");
  room.join("Sam");
  room.leave(a.id);
  const d = room.join("Riley").peer;
  assert.equal(d.name, "Riley");
});

test("max peers can be raised", () => {
  const room = new Room({ maxPeers: 5 });
  for (const n of ["A", "B", "C", "D", "E"]) room.join(n);
  assert.equal(room.list().length, 5);
  assert.equal(room.list()[4].overlayIp, "10.77.0.5");
  assert.throws(() => room.join("F"), /max 5/);
});

test("refreshLights marks isolated", () => {
  const room = new Room();
  const p = room.join("Maya", 0).peer;
  const { isolated } = room.refreshLights(21_000);
  assert.equal(p.light, "isolated");
  assert.equal(isolated[0].name, "Maya");
});

test("lightFromLastSeen thresholds", () => {
  const now = 20_000;
  assert.equal(lightFromLastSeen(19_000, now), "connected");
  assert.equal(lightFromLastSeen(10_000, now), "degraded");
  assert.equal(lightFromLastSeen(0, now), "isolated");
});
