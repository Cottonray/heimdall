import http from "node:http";
import { totalmem } from "node:os";
import { chromium, type BrowserContext } from "playwright";
import { readFile } from "node:fs/promises";
import { sessions, get } from "./sessions.ts";
import { checkUrl, configureOrigins } from "./policy.ts";
import { observe } from "./observe.ts";
import { operate, targetRect } from "./actions.ts";
const browser = await chromium.launch({ headless: true });
// Reserve 512 MiB for Chromium and 256 MiB per isolated context.
let memoryLimit = totalmem();
for (const path of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
  const value = Number(await readFile(path, "utf8").catch(() => ""));
  if (Number.isFinite(value) && value > 0) memoryLimit = Math.min(memoryLimit, value);
}
const capacity = Math.max(1, Math.floor((memoryLimit / 1024 / 1024 - 512) / 256));
let opening = 0;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const reply = (status: number, data: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  try {
    if (url.pathname === "/healthz")
      return reply(200, {
        ok: browser.isConnected(),
        active: sessions.size,
        capacity,
      });
    if (url.pathname === "/demo/api/accounts")
      return reply(200, {
        accounts: [{ name: "QA 테스트 계좌", balance: 1250000 }],
        demo: true,
      });
    if (url.pathname === "/demo/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(new URL("../demo.html", import.meta.url)));
      return;
    }
    if (
      !process.env.AIQA_WORKER_SECRET ||
      req.headers.authorization !== "Bearer " + process.env.AIQA_WORKER_SECRET
    )
      return reply(401, { error: "unauthorized" });
    const id = url.searchParams.get("id") || "";
    if (url.pathname === "/frame") {
      const s = get(id);
      res.writeHead(200, { "content-type": "image/jpeg" });
      res.end(await s.page.screenshot({ type: "jpeg", quality: 65 }));
      return;
    }
    if (url.pathname === "/observe")
      return reply(200, {
        ...(await observe(get(id).page)),
        logs: get(id).logs.slice(-60),
      });
    let text = "";
    for await (const b of req) {
      text += b;
      if (text.length > 64000) throw new Error("요청이 너무 커요");
    }
    const data = JSON.parse(text || "{}");
    if (url.pathname === "/configure") {
      configureOrigins(data.origins);
      return reply(200, { ok: true });
    }
    if (url.pathname === "/open") {
      if (sessions.size + opening >= capacity)
        throw new Error(`브라우저 ${capacity}개가 사용 중이에요. 사용하지 않는 테스트를 닫아 주세요`);
      if (sessions.has(data.id)) throw new Error("이미 열린 세션이에요");
      const target = checkUrl(data.url || "http://127.0.0.1:8081/demo/");
      opening++;
      let context: BrowserContext;
      try {
        context = await browser.newContext({
          viewport: data.mobile
            ? { width: 390, height: 844 }
            : { width: 1100, height: 720 },
          isMobile: !!data.mobile,
          hasTouch: !!data.mobile,
          serviceWorkers: "block",
        });
      } catch (e) {
        opening--;
        throw e;
      }
      try {
        const logs: unknown[] = [];
        const log = (v: unknown) => {
          logs.push({ at: new Date().toISOString(), ...(v as object) });
          if (logs.length > 150) logs.shift();
        };
        await context.route("**/*", (route) => {
          try {
            checkUrl(route.request().url());
            return route.continue();
          } catch {
            return route.abort("blockedbyclient");
          }
        });
        const page = await context.newPage();
        page.setDefaultTimeout(7000);
        page.on("console", (m) =>
          log({
            type: "console",
            level: m.type(),
            text: m.text().slice(0, 1000),
          }),
        );
        page.on("pageerror", (e) => log({ type: "error", text: e.message }));
        page.on("response", (r) =>
          log({
            type: "network",
            status: r.status(),
            url: r.url().split("?")[0],
          }),
        );
        page.on("requestfailed", (r) =>
          log({
            type: "network-error",
            url: r.url().split("?")[0],
            text: r.failure()?.errorText,
          }),
        );
        // Reserve the slot before navigation so simultaneous opens cannot exceed capacity.
        sessions.set(data.id, { context, page, logs, at: Date.now() });
        try {
          await page.goto(target, { waitUntil: "domcontentloaded" });
        } catch (e) {
          sessions.delete(data.id);
          await context.close();
          throw e;
        }
        return reply(200, await observe(page));
      } finally {
        opening--;
      }
    }
    if (url.pathname === "/target")
      return reply(200, await targetRect(data.id, data.action));
    if (url.pathname === "/action")
      return reply(200, await operate(data.id, data.action));
    if (url.pathname === "/close") {
      const s = sessions.get(data.id);
      sessions.delete(data.id);
      await s?.context.close();
      return reply(200, { ok: true });
    }
    reply(404, { error: "not found" });
  } catch (e) {
    reply(400, { error: String(e).slice(0, 700) });
  }
});
server.listen(8081);
setInterval(() => {
  for (const [id, s] of sessions)
    if (Date.now() - s.at > 30 * 60000) {
      sessions.delete(id);
      void s.context.close();
    }
}, 60000).unref();
