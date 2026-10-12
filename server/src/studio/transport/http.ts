import {
  readPhoneSettings,
  updatePhoneSettings,
} from "../infrastructure/phone-settings.ts";
import {
  cameraAvailable,
  applyCameraImage,
} from "../infrastructure/camera-image.ts";
import {
  appList,
  appFile,
  beginUpload,
  uploadChunk,
} from "../infrastructure/app-library.ts";
import { isIos, iosRequest } from "../infrastructure/ios-bridge.ts";
import { iosWebDebug } from "../domain/ios-web-debug.ts";
import { aiModel, saveAiModel } from "../infrastructure/ai-model.ts";
import {
  posts,
  savePost,
  comments,
  saveComment,
} from "../infrastructure/community.ts";
import {
  deviceMetadata,
  saveDeviceMetadata,
} from "../infrastructure/device-metadata.ts";
import { handleAgent } from "../infrastructure/agent-registry.ts";
import { listTestData, saveTestData } from "../infrastructure/test-data.ts";
import {
  notifications,
  readNotifications,
} from "../infrastructure/notifications.ts";
import {
  authenticate,
  listUsers,
  editUser,
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
import { readFile, open } from "node:fs/promises";
import path from "node:path";
import * as device from "../../device.ts";
import { listDeviceInventory } from "../infrastructure/device-inventory.ts";
import { get } from "../domain/session.ts";
import { DIR } from "../infrastructure/config.ts";
import {
  saved,
  removeSessions,
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
  reserveDevice,
  deviceUsage,
  deviceOwned,
  ownsDevice,
} from "../infrastructure/device-lease.ts";
import { DEVTOOLS_PREFIX, serveDevTools } from "./devtools-assets.ts";
const debugging = new Set<string>();
const installing = new Set<string>();
export async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
) {
  if (!route.startsWith("/api/studio")) return false;
  if (route === "/api/studio/agents/poll") {
    await handleAgent(req, res);
    return true;
  }
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
    if (
      (route === "/api/studio/camera" ||
        route === "/api/studio/phone-settings") &&
      req.method === "GET"
    ) {
      const serial = url.searchParams.get("serial") || "";
      if (
        !auth ||
        !ownsDevice(url.searchParams.get("viewer") || "", serial, auth.hash)
      ) {
        send(403, { error: "기기를 점유한 창에서 이용해 주세요." });
        return true;
      }
      send(
        200,
        route.endsWith("phone-settings")
          ? await readPhoneSettings(serial)
          : await cameraAvailable(serial),
      );
      return true;
    }
    if (route === "/api/studio/apps" && req.method === "GET") {
      if (!auth) {
        send(401, { error: "로그인이 필요해요" });
        return true;
      }
      send(200, await appList());
      return true;
    }
    if (route === "/api/studio/apps/upload") {
      if (auth?.user.role !== "admin" || !allowedBrowserOrigin(req)) {
        send(403, { error: "관리자만 업로드할 수 있어요" });
        return true;
      }
      if (req.method !== "POST") {
        send(405, {});
        return true;
      }
      send(
        200,
        id
          ? await uploadChunk(
              auth.hash,
              id,
              Number(url.searchParams.get("offset")),
              req,
            )
          : await beginUpload(
              auth.hash,
              url.searchParams.get("filename") || "",
              Number(url.searchParams.get("size")),
            ),
      );
      return true;
    }
    if (route === "/api/studio/apps/install") {
      if (!auth || !allowedBrowserOrigin(req)) {
        send(403, { error: "로그인이 필요해요" });
        return true;
      }
      if (req.method !== "POST") {
        send(405, {});
        return true;
      }
      const serial = url.searchParams.get("serial") || "";
      const viewer = url.searchParams.get("viewer") || "";
      if (!ownsDevice(viewer, serial, auth.hash)) {
        send(409, { error: "기기를 점유한 상태에서 설치할 수 있어요" });
        return true;
      }
      if (installing.has(serial)) {
        send(409, { error: "앱을 설치하고 있어요" });
        return true;
      }
      installing.add(serial);
      try {
        const { file, app } = await appFile(id);
        if ((app.platform === "ios") !== isIos(serial))
          throw new Error("기기에 맞는 플랫폼의 앱을 선택해 주세요");
        if (!ownsDevice(viewer, serial, auth.hash))
          throw new Error("기기 연결을 다시 확인해 주세요");
        if (isIos(serial)) {
          const route = "/app-install?serial=" + encodeURIComponent(serial);
          await iosRequest(route, { phase: "begin", id, size: app.size });
          const handle = await open(file, "r");
          try {
            let offset = 0;
            const buffer = Buffer.alloc(384 * 1024);
            while (offset < app.size) {
              if (!ownsDevice(viewer, serial, auth.hash))
                throw new Error("기기 점유가 해제됐어요");
              const { bytesRead } = await handle.read(
                buffer,
                0,
                Math.min(buffer.length, app.size - offset),
                offset,
              );
              if (!bytesRead) throw new Error("앱 파일을 읽지 못했어요");
              await iosRequest(route, {
                phase: "chunk",
                id,
                offset,
                data: buffer.subarray(0, bytesRead).toString("base64"),
              });
              offset += bytesRead;
            }
            await iosRequest(route, { phase: "finish", id });
          } finally {
            await handle.close();
          }
        } else {
          const result = await device.adb(
            ["-s", serial, "install", "-r", file],
            180000,
            true,
          );
          if (
            result.code !== 0 ||
            !result.stdout.toString().includes("Success")
          )
            throw new Error(
              "앱 설치에 실패했어요. APK 서명과 기기 호환성을 확인해 주세요",
            );
        }
        send(200, { ok: true });
      } finally {
        installing.delete(serial);
      }
      return true;
    }
    if (route === "/api/studio/admin/agent-download") {
      if (auth?.user.role !== "admin")
        send(403, { error: "관리자만 이용할 수 있어요" });
      else if (req.method !== "GET") send(405, {});
      else if (url.searchParams.get("platform") !== "macos")
        send(404, { error: "아직 제공하지 않는 OS예요" });
      else {
        const file = await readFile(
          "/opt/aiqa/web/studio/assets/heimdall-macos.zip",
        );
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="heimdall-macos.zip"',
          "Cache-Control": "no-store",
        });
        res.end(file);
      }
      return true;
    }
    if (route === "/api/studio/admin/device-metadata") {
      if (auth?.user.role !== "admin") {
        send(403, { error: "관리자만 이용할 수 있어요" });
        return true;
      }
      if (req.method === "GET") {
        send(200, await deviceMetadata());
        return true;
      }
      if (req.method !== "POST") {
        send(405, {});
        return true;
      }
    }
    if (route === "/api/studio/admin/ai-model") {
      if (auth?.user.role !== "admin") {
        send(403, { error: "관리자만 이용할 수 있어요" });
        return true;
      }
      if (req.method === "GET") {
        send(200, await aiModel());
        return true;
      }
      if (req.method !== "POST") {
        send(405, {});
        return true;
      }
    }
    if (route === "/api/studio/admin/users") {
      if (auth?.user.role !== "admin") {
        send(403, { error: "관리자만 이용할 수 있어요" });
        return true;
      }
      if (req.method === "GET") {
        send(200, await listUsers());
        return true;
      }
      if (req.method !== "POST") {
        send(405, {});
        return true;
      }
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
    if (
      (route === "/api/studio/community" ||
        route === "/api/studio/community/comments") &&
      !auth
    ) {
      send(401, { error: "로그인이 필요해요" });
      return true;
    }
    if (route === "/api/studio/community/comments" && req.method === "GET") {
      send(200, await comments(url.searchParams.get("postId") || ""));
      return true;
    }
    if (route === "/api/studio/community" && req.method === "GET") {
      send(200, await posts());
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
      const serial = url.searchParams.get("serial") || "";
      if (isIos(serial)) {
        if (
          !ownsDevice(url.searchParams.get("viewer") || "", serial, auth.hash)
        ) {
          send(409, { error: "기기를 점유한 창에서 웹뷰를 확인해 주세요" });
          return true;
        }
        send(
          200,
          JSON.parse(
            (
              await iosRequest(`/webviews?serial=${encodeURIComponent(serial)}`)
            ).toString(),
          ),
        );
      } else send(200, await discoverWebViews(serial));
      return true;
    }
    if (route === "/api/studio/inspector" && req.method === "GET") {
      const serial = url.searchParams.get("serial") || "";
      const viewer = url.searchParams.get("viewer") || "";
      if (!auth || !ownsDevice(viewer, serial, auth.hash)) {
        send(409, { error: "기기를 점유한 창에서 인스펙터를 열어 주세요" });
        return true;
      }
      if (isIos(serial)) {
        const discovery = JSON.parse(
          (
            await iosRequest("/webviews?serial=" + encodeURIComponent(serial))
          ).toString(),
        );
        if (
          !discovery.targets.some((target: { id: string }) => target.id === id)
        )
          throw new Error("웹페이지를 다시 선택해 주세요");
        send(200, {
          frontend:
            DEVTOOLS_PREFIX +
            "serve_rev/@2d54072eb2f350d37f3f304c4ba0fafcddbd7e82/inspector.html",
        });
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
        llm: (await aiModel()).configured,
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
      route === "/api/studio/profile" || route === "/api/studio/camera"
        ? Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 1024
        : 64000;
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > bodyLimit)
        throw new Error("요청이 너무 커요");
    }
    const data = JSON.parse(body || "{}");
    if (route === "/api/studio/phone-settings") {
      const serial = url.searchParams.get("serial") || "";
      const viewer = url.searchParams.get("viewer") || "";
      const authorized = () => !!auth && ownsDevice(viewer, serial, auth.hash);
      if (!allowedBrowserOrigin(req) || !authorized()) {
        send(403, { error: "기기를 점유한 창에서 적용해 주세요." });
        return true;
      }
      send(200, await updatePhoneSettings(serial, data, authorized));
      return true;
    }
    if (route === "/api/studio/camera") {
      const serial = url.searchParams.get("serial") || "";
      const viewer = url.searchParams.get("viewer") || "";
      const authorized = () => !!auth && ownsDevice(viewer, serial, auth.hash);
      if (!allowedBrowserOrigin(req) || !authorized()) {
        send(403, { error: "기기를 점유한 창에서 적용해 주세요." });
        return true;
      }
      send(200, await applyCameraImage(serial, data.image, authorized));
      return true;
    }
    if (route === "/api/studio/ios-web-debug" && req.method === "POST") {
      const serial = url.searchParams.get("serial") || "";
      const viewer = url.searchParams.get("viewer") || "";
      if (!auth || !isIos(serial) || !ownsDevice(viewer, serial, auth.hash)) {
        send(409, { error: "기기를 점유한 창에서 웹 디버깅을 실행해 주세요" });
        return true;
      }
      const debug = iosWebDebug(data);
      if (debugging.has(serial)) {
        send(429, { error: "이전 웹 디버깅이 끝나면 다시 실행해 주세요" });
        return true;
      }
      const hold = reserveDevice(serial, auth.hash);
      debugging.add(serial);
      try {
        const result = await iosRequest(
          `/web-debug?serial=${encodeURIComponent(serial)}`,
          debug,
        );
        if (
          !ownsDevice(viewer, serial, auth.hash) ||
          !(await authenticate(req))
        ) {
          send(409, { error: "기기 점유가 종료됐어요" });
          return true;
        }
        send(200, JSON.parse(result.toString()));
      } finally {
        debugging.delete(serial);
        hold.release();
      }
      return true;
    }

    if (route === "/api/studio/admin/ai-model") {
      await saveAiModel(data);
      send(200, await aiModel());
      return true;
    }
    if (route === "/api/studio/community/comments") {
      await saveComment(auth!.user, data);
      send(200, { ok: true });
      return true;
    }
    if (route === "/api/studio/sessions/delete") {
      if (!auth) {
        send(401, { error: "로그인이 필요해요" });
        return true;
      }
      await removeSessions(data.ids, data.projectId);
      send(200, { ok: true });
      return true;
    }
    if (route === "/api/studio/community") {
      await savePost(auth!.user, data);
      send(200, { ok: true });
      return true;
    }
    if (route === "/api/studio/admin/users") {
      await editUser(auth!.user.id, data);
      send(200, { ok: true });
      return true;
    }
    if (route === "/api/studio/admin/device-metadata") {
      await saveDeviceMetadata(data);
      send(200, { ok: true });
      return true;
    }
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
      else send(200, await renameProject(data.id, data.name, data.source));
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
