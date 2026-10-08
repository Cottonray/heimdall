import { WORKER } from "../infrastructure/config.ts";
export async function worker<T = Record<string, unknown>>(
  route: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(`${WORKER}${route}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || `브라우저 워커 ${r.status}`);
  return data;
}
