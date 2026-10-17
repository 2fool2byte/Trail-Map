import { randomBytes, randomUUID } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newPeerId(): string {
  return randomUUID();
}

export function newRoomCode(): string {
  const bytes = randomBytes(4);
  let suffix = "";
  for (const b of bytes) {
    suffix += ALPHABET[b % ALPHABET.length];
  }
  return `WL-${suffix}`;
}

export function newNonce(): string {
  return randomUUID();
}

export function newTransferId(): string {
  return randomUUID();
}
