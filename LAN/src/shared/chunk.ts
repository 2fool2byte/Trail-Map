export function encodeChunk(transferId: string, payload: Buffer): Buffer {
  const id = Buffer.from(transferId.replaceAll("-", ""), "hex");
  if (id.length !== 16) {
    throw new Error("transferId must be a UUID");
  }
  return Buffer.concat([id, payload]);
}

export function decodeChunk(buf: Buffer): { transferId: string; payload: Buffer } | null {
  if (buf.length < 16) return null;
  const hex = buf.subarray(0, 16).toString("hex");
  const transferId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { transferId, payload: buf.subarray(16) };
}
