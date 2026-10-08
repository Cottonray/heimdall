import type { PublicSession } from "./types.ts";

/** Accept the transitional JSON-string rows without discarding any saved history. */
export function readSessionBody(value: unknown): PublicSession {
  const body: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (
    !body ||
    typeof body !== "object" ||
    !("id" in body) ||
    typeof body.id !== "string" ||
    !("steps" in body) ||
    !Array.isArray(body.steps)
  ) {
    throw new Error("저장된 시나리오 형식이 올바르지 않아요");
  }
  return body as PublicSession;
}
