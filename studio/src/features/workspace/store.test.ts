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
    location: { hash, pathname: "/aiqa/studio/" },
    history: { replaceState() {} },
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
  t.mock.method(globalThis, "fetch", (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://heimdall.test");
    if (url.pathname.endsWith("/auth/test-login"))
      return Promise.resolve(Response.json({ user }));
    assert.equal(url.pathname, "/aiqa/api/studio/status");
    return new Promise<Response>((resolve) => {
      requests.push({
        projectId: url.searchParams.get("projectId") || "",
        succeed: (sessions) => resolve(Response.json(status(sessions))),
        fail: (code) =>
          resolve(Response.json({ error: "stale failure" }, { status: code })),
      });
    });
  });
  const store = new WorkspaceStore();
  return {
    store,
    requests,
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
