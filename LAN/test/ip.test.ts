import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildIcmpEchoRequest,
  icmpEchoIdSeq,
  icmpEchoReply,
  internetChecksum,
  ipv4Dest,
  unwrapIp,
  wrapIp,
} from "../src/shared/ip.ts";

test("WLIP wrap/unwrap and dest IP", () => {
  const pkt = buildIcmpEchoRequest("10.77.0.1", "10.77.0.2", 7, 3);
  assert.equal(ipv4Dest(pkt), "10.77.0.2");
  assert.equal(internetChecksum(pkt.subarray(0, 20)), 0);
  const frame = wrapIp(pkt);
  assert.deepEqual(unwrapIp(frame), pkt);
});

test("ICMP echo reply swaps addresses and type", () => {
  const req = buildIcmpEchoRequest("10.77.0.1", "10.77.0.2", 9, 1);
  const reply = icmpEchoReply(req);
  assert.ok(reply);
  assert.equal(ipv4Dest(reply!), "10.77.0.1");
  const info = icmpEchoIdSeq(reply!);
  assert.equal(info?.type, 0);
  assert.equal(info?.id, 9);
  assert.equal(info?.seq, 1);
  assert.equal(internetChecksum(reply!.subarray(0, 20)), 0);
});
