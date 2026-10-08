import type { BrowserContext, Page } from "playwright";
export const sessions = new Map<
  string,
  { context: BrowserContext; page: Page; logs: unknown[]; at: number }
>();
export function get(id: string) {
  const s = sessions.get(id);
  if (!s) throw new Error("종료된 브라우저예요");
  s.at = Date.now();
  return s;
}
