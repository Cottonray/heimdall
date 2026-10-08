import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as device from "../../device.ts";
import { get } from "../domain/session.ts";
import { DIR } from "../infrastructure/config.ts";
import { saved } from "../infrastructure/repository.ts";
import { frame } from "../engines/observe.ts";
import { worker } from "../engines/browser.ts";
import { dispatch } from "../application/dispatch.ts";
import { allowed } from "./access.ts";
import { tools } from "./mcp.ts";
export async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
) {
  if (!route.startsWith("/api/studio")) return false;
  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  if (!allowed(req)) {
    send(403, { error: "gateway.example 로그인 후 이용해 주세요" });
    return true;
  }
  try {
    const url = new URL(req.url || "/", "http://localhost"),
      id = url.searchParams.get("id") || "";
    if (route === "/api/studio/status") {
      send(200, {
        browser: await worker("/healthz").catch(() => ({ ok: false })),
        android: await device.state(),
        llm: !!process.env.AIQA_OPENROUTER_API_KEY,
        sessions: await dispatch("qa_list", {}),
      });
      return true;
    }
    if (route === "/api/studio/frame") {
      const b = await frame(get(id));
      res.writeHead(200, {
        "content-type": "image/jpeg",
        "cache-control": "no-store",
      });
      res.end(b);
      return true;
    }
    if (route === "/api/studio/evidence") {
      const file = url.searchParams.get("file") || "";
      if (!/^\d+\.jpg$/.test(file)) throw new Error("없는 파일이에요");
      await saved(id);
      const b = await readFile(path.join(DIR, id, file));
      res.writeHead(200, { "content-type": "image/jpeg" });
      res.end(b);
      return true;
    }
    if (req.method !== "POST") {
      send(405, { error: "POST만 지원해요" });
      return true;
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 64000) throw new Error("요청이 너무 커요");
    }
    const data = JSON.parse(body || "{}");
    if (route === "/api/studio/mcp") {
      const reply = (result: unknown) =>
        send(200, { jsonrpc: "2.0", id: data.id, result });
      if (data.id === undefined) {
        res.writeHead(202);
        res.end();
        return true;
      }
      if (data.method === "initialize")
        reply({
          protocolVersion: "2025-11-25",
          capabilities: { tools: {} },
          serverInfo: { name: "aiqa-studio", version: "1.0.0" },
        });
      else if (data.method === "ping") reply({});
      else if (data.method === "tools/list")
        reply({
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: {
              type: "object",
              properties: t.props,
              additionalProperties: false,
            },
          })),
        });
      else if (data.method === "tools/call") {
        try {
          reply({
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await dispatch(data.params.name, data.params.arguments || {}),
                ),
              },
            ],
          });
        } catch (e) {
          reply({
            isError: true,
            content: [{ type: "text", text: String(e) }],
          });
        }
      } else
        send(200, {
          jsonrpc: "2.0",
          id: data.id,
          error: { code: -32601, message: "Method not found" },
        });
    } else send(200, await dispatch(data.tool, data.arguments || {}));
  } catch (e) {
    if (!res.headersSent) send(400, { error: String(e).slice(0, 800) });
    else res.end();
  }
  return true;
}
