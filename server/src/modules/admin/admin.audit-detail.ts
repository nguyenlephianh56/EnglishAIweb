import type { Prisma } from "@prisma/client";

const PRIVATE_DETAIL_KEYS = new Set([
  "password", "passwordhash", "authorization",
  "token", "accesstoken", "refreshtoken", "idtoken", "sessiontoken",
  "secret", "jwtsecret", "apikey", "geminiapikey",
  "email", "answer", "content",
]);

export function redactDetail(detail: Prisma.JsonValue): Prisma.JsonValue {
  if (Array.isArray(detail)) return detail.map(redactDetail);
  if (detail === null || typeof detail !== "object") return detail;

  const entries: [string, Prisma.JsonValue][] = [];
  for (const [key, value] of Object.entries(detail)) {
    const normalizedKey = key.replace(/[\s_-]/g, "").toLowerCase();
    if (value === undefined || PRIVATE_DETAIL_KEYS.has(normalizedKey)) continue;
    entries.push([key, redactDetail(value)]);
  }
  return Object.fromEntries(entries);
}