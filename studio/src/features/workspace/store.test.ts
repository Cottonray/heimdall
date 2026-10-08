import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type {
  Session,
  StudioStatus,
  User,
} from "../../../../contracts/studio.ts";

Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://heimdall.test/aiqa/studio/") });
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./store.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const { WorkspaceStore } = (await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
)) as typeof import("./store");

const user: User = {
  id: "tester",
  username: "tester",
  name: "테스터",
  role: "user",
};
function session(id: string, projectId: string, updated = 1): Session {
  return {
    id,
    projectId,
    name: id,
    engine: "web",
    url: "",
    state: "closed",
    message: "",
    created: "2026-10-08T00:00:00Z",
    updated,
    steps: [],
    working: false,
    ai: false,
  };
}
function status(sessions: Session[]): StudioStatus {
  return {
    sessions,
    projects: [],
    domains: [],
    browser: { ok: true },
    android: { booted: false },
    llm: true,
  };
}
function fixture(t: TestContext, hash = "") {
  for (const [key, value] of Object.entries({
    location: new URL("https://heimdall.test/aiqa/studio/" + hash),
    history: { replaceState() {}, pushState() {} },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
    });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const requests: {
    projectId: string;
    succeed: (sessions: Session[]) => void;
    fail: (code: number) => void;
  }[] = [];
  const profileRequests: {
    path: string;
    body: unknown;
    reply: (body: unknown, code?: number) => void;
  }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://heimdall.test");
      if (url.pathname.endsWith("/auth/test-login"))
        return Promise.resolve(Response.json({ user }));
      if (url.pathname.startsWith("/aiqa/api/studio/profile"))
        return new Promise<Response>((resolve) => {
          profileRequests.push({
            path: url.pathname,
            body: JSON.parse(String(init?.body)),
            reply: (body, code = 200) =>
              resolve(Response.json(body, { status: code })),
          });
        });
      assert.equal(url.pathname, "/aiqa/api/studio/status");
      return new Promise<Response>((resolve) => {
        requests.push({
          projectId: url.searchParams.get("projectId") || "",
          succeed: (sessions) => resolve(Response.json(status(sessions))),
          fail: (code) =>
            resolve(
              Response.json({ error: "stale failure" }, { status: code }),
            ),
        });
      });
    },
  );
  const store = new WorkspaceStore();
  return {
    store,
    requests,
    profileRequests,
    async login(sessions: Session[]) {
      const login = store.testLogin("user");
      await setImmediate();
      assert.equal(requests[0]?.projectId, "");
      requests.shift()!.succeed(sessions);
      await login;
    },
    async respond(projectId: string, sessions: Session[]) {
      const request = requests.shift();
      assert.equal(request?.projectId, projectId);
      request!.succeed(sessions);
      await setImmediate();
    },
  };
}

test("project home restores global statistics and reopening a test restores its project", async (t) => {
  const f = fixture(t);
  const a = session("test-a", "project-a");
  const b = session("test-b", "project-b");
  await f.login([a, b]);

  f.store.enterProject("project-a");
  assert.equal(f.store.getSnapshot().activeTab, "dashboard");
  await f.respond("project-a", [a]);
  f.store.select(a.id);
  f.store.navigate("projects");
  assert.equal(f.store.getSnapshot().projectId, "");
  assert.equal(f.store.getSnapshot().selectedId, "");
  assert.deepEqual(f.store.getSnapshot().status?.sessions, []);
  assert.ok(f.store.getSnapshot().tabs.includes(a.id));
  await f.respond("", [a, b]);
  assert.equal(f.store.getSnapshot().status?.sessions.length, 2);

  f.store.select(b.id);
  assert.equal(f.store.getSnapshot().projectId, "project-b");
  assert.equal(f.store.getSnapshot().activeTab, b.id);
  await f.respond("project-b", [b]);
  assert.deepEqual(f.store.getSnapshot().status?.sessions, [b]);
  assert.ok(f.store.getSnapshot().sessions.some((s) => s.id === a.id));
});

test("late success and unauthorized failure cannot overwrite a scope reopened later", async (t) => {
  const f = fixture(t);
  const a = session("test-a", "project-a", 1);
  await f.login([a]);
  f.store.enterProject("project-a");
  f.store.navigate("projects");
  f.store.enterProject("project-a");
  assert.deepEqual(
    f.requests.map((request) => request.projectId),
    ["project-a", "", "project-a"],
  );
  const [oldProject, oldHome, current] = f.requests.splice(0);
  const latest = { ...a, name: "latest", updated: 2 };
  current.succeed([latest]);
  await setImmediate();
  oldProject.succeed([a]);
  oldHome.fail(401);
  await setImmediate();
  const snapshot = f.store.getSnapshot();
  assert.equal(snapshot.projectId, "project-a");
  assert.equal(snapshot.user?.id, user.id);
  assert.equal(snapshot.error, "");
  assert.equal(snapshot.loading, false);
  assert.deepEqual(snapshot.status?.sessions, [latest]);
});

test("a selected cached test stays open when outside the recent status window", async (t) => {
  const f = fixture(t);
  const older = session("older-test", "project-a", 1);
  const recent = session("recent-test", "project-a", 2);
  await f.login([older]);
  f.store.select(older.id);
  await f.respond("project-a", [recent]);
  assert.equal(f.store.getSnapshot().selectedId, older.id);
  assert.equal(f.store.getSnapshot().activeTab, older.id);
  assert.deepEqual(f.store.getSnapshot().status?.sessions, [recent]);
  assert.equal(f.requests.length, 0);
});

test("a deep-linked test loads its project dashboard scope after authentication", async (t) => {
  const linked = session("linked-test", "project-b");
  const f = fixture(t, "#" + linked.id);
  await f.login([linked]);
  assert.equal(f.store.getSnapshot().projectId, "project-b");
  assert.equal(f.store.getSnapshot().activeTab, linked.id);
  await f.respond("project-b", [linked]);
  assert.equal(f.store.getSnapshot().selectedId, linked.id);
  assert.equal(f.store.getSnapshot().loading, false);
});

test("device farm leaves project scope without losing open work", async (t) => {
  const f = fixture(t);
  const a = session("test-a", "project-a");
  await f.login([a]);
  f.store.select(a.id);
  await f.respond("project-a", [a]);
  f.store.navigate("devices");
  assert.equal(f.store.getSnapshot().activeTab, "devices");
  assert.equal(f.store.getSnapshot().projectId, "");
  assert.equal(f.store.getSnapshot().selectedId, "");
  assert.ok(f.store.getSnapshot().tabs.includes(a.id));
  await f.respond("", [a]);
  f.store.enterProject("project-a");
  await f.respond("project-a", [a]);
  assert.equal(f.store.getSnapshot().activeTab, "dashboard");
});

test("saving an avatar updates the signed-in profile and blocks duplicate changes", async (t) => {
  const f = fixture(t);
  await f.login([]);
  const avatar = "data:image/webp;base64,fixture";
  const saving = f.store.saveProfile(avatar);
  assert.equal(f.store.getSnapshot().busy, true);
  assert.equal((await f.store.saveProfile(null)).ok, false);
  assert.equal(f.profileRequests.length, 1);
  assert.deepEqual(f.profileRequests[0].body, { avatar });
  const savedUser = {
    ...user,
    avatar: "/aiqa/api/studio/profile/avatar?v=1",
    avatarUploadAllowed: true,
  };
  f.profileRequests.shift()!.reply(savedUser);
  assert.deepEqual(await saving, { ok: true });
  assert.deepEqual(f.store.getSnapshot().user, savedUser);
  assert.equal(f.store.getSnapshot().busy, false);

  const deleting = f.store.saveProfile(null);
  assert.deepEqual(f.profileRequests[0].body, { avatar: null });
  f.profileRequests.shift()!.reply({ ...savedUser, avatar: null });
  assert.equal((await deleting).ok, true);
  assert.equal(f.store.getSnapshot().user?.avatar, null);
});

test("password rotation ignores old-cookie failures and resumes polling afterward", async (t) => {
  const f = fixture(t);
  await f.login([]);
  const oldRefresh = f.store.refresh();
  const oldCookie = f.requests.shift()!;
  const changing = f.store.changePassword(
    "current-fixture",
    "replacement-fixture",
  );
  assert.equal(f.profileRequests[0].path, "/aiqa/api/studio/profile/password");
  await f.store.refresh();
  assert.equal(f.requests.length, 0);
  oldCookie.fail(401);
  await oldRefresh;
  assert.equal(f.store.getSnapshot().user?.id, user.id);
  f.profileRequests.shift()!.reply({ ok: true });
  assert.deepEqual(await changing, { ok: true });
  assert.equal(f.requests.length, 1);
  await f.respond("", []);
  assert.equal(f.store.getSnapshot().user?.id, user.id);
  assert.equal(f.store.getSnapshot().error, "");
});
