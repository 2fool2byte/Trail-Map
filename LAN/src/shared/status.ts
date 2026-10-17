export type Light = "connected" | "degraded" | "isolated";

export function lightFromLastSeen(lastSeen: number, now = Date.now()): Light {
  const age = now - lastSeen;
  if (age < 5_000) return "connected";
  if (age < 20_000) return "degraded";
  return "isolated";
}
