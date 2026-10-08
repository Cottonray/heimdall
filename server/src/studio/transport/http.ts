import { listTestData, saveTestData } from "../infrastructure/test-data.ts";
import {
  notifications,
  readNotifications,
} from "../infrastructure/notifications.ts";
import {
  authenticate,
  listUsers,
  login,
  testLogin,
  logout,
  localRequest,
  changePassword,
  readProfileAvatar,
  updateProfile,
} from "../infrastructure/auth.ts";
import { MAX_AVATAR_BYTES } from "../infrastructure/avatar-storage.ts";
import {
  listDomains,
  saveDomain,
  removeDomain,
} from "../infrastructure/domains.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as device from "../../device.ts";
import { listDeviceInventory } from "../infrastructure/device-inventory.ts";
import { get } from "../domain/session.ts";
import { DIR } from "../infrastructure/config.ts";
import {
  saved,
  listSessions,
  listProjects,
  createProject,
  renameProject,
  moveSession,
} from "../infrastructure/repository.ts";
import { frame } from "../engines/observe.ts";
import { worker } from "../engines/browser.ts";
import { dispatch } from "../application/dispatch.ts";
import { allowed, allowedBrowserOrigin } from "./access.ts";
import { tools } from "./mcp.ts";
import { discoverWebViews, openWebView } from "../infrastructure/webviews.ts";
import {
  deviceUsage,
  deviceOwned,
  ownsDevice,
} from "../infrastructure/device-lease.ts";
import { DEVTOOLS_PREFIX, serveDevTools } from "./devtools-assets.ts";
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
    send(403, { error: "헤임달에 로그인 후 이용해 주세요" });
    return true;
  }
  try {
    const url = new URL(req.url || "/", "http://localhost"),
      id = url.searchParams.get("id") || "";
    const auth = await authenticate(req);
    if (route === "/api/studio/admin/users") {
      if (auth?.user.role !== "admin")
        send(403, { error: "관리자만 이용할 수 있어요" });
      else if (req.method !== "GET")
        send(405, { error: "지원하지 않는 요청이에요" });
      else send(200, await listUsers());
      return true;
    }
    if (route === "/api/studio/auth/me") {
      send(200, { user: auth?.user || null });
      return true;
    }
    const authRoute =
      route === "/api/studio/auth/login" ||
      route === "/api/studio/auth/test-login" ||
      route === "/api/studio/auth/logout";
    if (!authRoute && !auth && !localRequest(req)) {
      send(401, { error: "로그인이 필요해요" });
      return true;
    }
    if (
      req.method === "POST" &&
      !localRequest(req) &&
      !allowedBrowserOrigin(req)
    ) {
      send(403, { error: "요청 출처를 확인해 주세요" });
      return true;
    }
    if (
      (route.startsWith("/api/studio/profile") ||
        route.startsWith("/api/studio/notifications") ||
        route === "/api/studio/test-data") &&
      !auth
    ) {
      send(401, { error: "로그인이 필요해요" });
      return true;
    }
    if (route === "/api/studio/profile/avatar" && req.method === "GET") {
      const image = await readProfileAvatar(auth!.user);
      if (!image) send(404, { error: "프로필 이미지가 없어요" });
      else {
        res.writeHead(200, {
          "content-type": image.mime,
          "content-length": image.bytes.length,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; sandbox",
        });
        res.end(image.bytes);
      }
      return true;
    }
    if (route === "/api/studio/test-data" && req.method === "GET") {
      send(200, await listTestData(url.searchParams.get("projectId") || ""));
      return true;
    }
    if (route === "/api/studio/notifications" && req.method === "GET") {
      send(200, await notifications(auth!.user.id));
      return true;
    }
    if (route === "/api/studio/devices" && req.method === "GET") {
      try {
        send(
          200,
          (await listDeviceInventory()).map((item) => ({
            ...item,
            usage: deviceUsage(item.serial),
            ownedByMe: !!auth && deviceOwned(item.serial, auth.hash),
          })),
        );
      } catch {
        send(502, {
          error: "기기 목록을 확인하지 못했어요. 잠시 후 새로고침해 주세요",
        });
      }
      return true;
    }
    if (route.startsWith("/api/studio/devtools/") && req.method === "GET") {
      if (!auth) {
        send(401, { error: "로그인이 필요해요" });
        return true;
      }
      await serveDevTools(res, route);
      return true;
    }
    if (route === "/api/studio/webviews" && req.method === "GET") {
      if (!auth) {
        send(401, { error: "로그인이 필요해요" });
        return true;
      }
      send(200, await discoverWebViews(url.searchParams.get("serial") || ""));
      return true;
    }
    if (route === "/api/studio/inspector" && req.method === "GET") {
      const serial = url.searchParams.get("serial") || "";
      const viewer = url.searchParams.get("viewer") || "";
      if (!auth || !ownsDevice(viewer, serial, auth.hash)) {
        send(409, { error: "기기를 점유한 창에서 인스펙터를 열어 주세요" });
        return true;
      }
      const connection = await openWebView(
        serial,
        url.searchParams.get("socket") || "",
        id,
      );
      try {
        if (!connection.target.revision)
          throw new Error("이 웹뷰의 DevTools 버전을 확인하지 못했어요");
        send(200, {
          frontend: `${DEVTOOLS_PREFIX}serve_rev/${connection.target.revision}/inspector.html`,
        });
      } finally {
        await connection.release();
      }
      return true;
    }
    if (route === "/api/studio/status") {
      send(200, {
        browser: await worker("/healthz").catch(() => ({ ok: false })),
        android: await device.state(),
        llm: !!process.env.AIQA_OPENROUTER_API_KEY,
        projects: await listProjects(),
        domains: await listDomains(),
        sessions: await listSessions(
          url.searchParams.get("projectId") || undefined,
        ),
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
    const bodyLimit =
      route === "/api/studio/profile"
        ? Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 1024
        : 64000;
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > bodyLimit)
        throw new Error("요청이 너무 커요");
    }
    const data = JSON.parse(body || "{}");
    if (route === "/api/studio/test-data") {
      await saveTestData(data);
      send(200, { ok: true });
      return true;
    }
    if (route === "/api/studio/notifications/read") {
      await readNotifications(auth!.user.id, data.ids);
      send(200, { ok: true });
      return true;
    }
    if (route === "/api/studio/auth/test-login") {
      send(200, { user: await testLogin(req, res, data.role) });
      return true;
    }
    if (route === "/api/studio/auth/login") {
      send(200, { user: await login(req, res, data) });
      return true;
    }
    if (route === "/api/studio/auth/logout") {
      await logout(req, res);
      send(200, { user: null });
      return true;
    }
    if (route === "/api/studio/profile") {
      send(200, await updateProfile(auth!.user, data.avatar));
      return true;
    }
    if (route === "/api/studio/profile/password") {
      send(200, await changePassword(auth!, res, data));
      return true;
    }
    if (route === "/api/studio/domains") {
      if (auth?.user.role !== "admin" && !localRequest(req)) {
        send(403, { error: "관리자만 도메인을 설정할 수 있어요" });
        return true;
      }
      send(
        200,
        data.remove ? await removeDomain(data.id) : await saveDomain(data),
      );
      return true;
    }
    if (route === "/api/studio/projects") {
      if (data.id === undefined) send(201, await createProject(data.name));
      else send(200, await renameProject(data.id, data.name));
      return true;
    }
    if (route === "/api/studio/project-assignment") {
      send(
        200,
        await moveSession(String(data.id || ""), String(data.projectId || "")),
      );
      return true;
    }
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
