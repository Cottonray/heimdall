import { openTab, closeTab, isPage, type Page } from "./tabs";
import type {
  Action,
  Session,
  StudioStatus,
  Step,
  User,
} from "../../../../contracts/studio";
import {
  api,
  ApiError,
  evidenceUrl,
  type ProfileActionResult,
} from "@/lib/api";
type Snapshot = {
  sessions: Session[];
  user: User | null;
  status: StudioStatus | null;
  projectId: string;
  selectedId: string;
  tabs: string[];
  activeTab: string;
  loading: boolean;
  busy: boolean;
  connected: boolean;
  error: string;
  frame: string;
};
const projectPages = new Set([
  "dashboard",
  "history",
  "execution",
  "board",
  "test-data",
  "scenarios",
  "project-settings",
]);
function readProjectRoute() {
  const params = new URLSearchParams(location.search);
  const projectId = params.get("project") || "";
  const page = params.get("page") || "dashboard";
  return { projectId, page: projectPages.has(page) ? page : "dashboard" };
}
const initialRoute = readProjectRoute();
export class WorkspaceStore {
  private value: Snapshot = {
    sessions: [],
    user: null,
    status: null,
    projectId: initialRoute.projectId,
    selectedId: location.hash.slice(1),
    tabs: location.hash.slice(1)
      ? ["projects", "dashboard", location.hash.slice(1)]
      : initialRoute.projectId
        ? ["projects", "dashboard", initialRoute.page].filter(
            (id, index, all) => all.indexOf(id) === index,
          )
        : ["projects"],
    activeTab:
      location.hash.slice(1) ||
      (initialRoute.projectId ? initialRoute.page : "projects"),
    loading: true,
    busy: false,
    connected: false,
    error: "",
    frame: "",
  };
  readonly terminalKeys = new Map<string, string>();
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private poll: ReturnType<typeof setInterval> | undefined;
  private stopped = true;
  private refreshVersion = 0;
  private changingPassword = false;
  private objectUrl = "";
  private pending = new Map<
    string,
    {
      resolve: (step: Step) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.value;
  private patch(patch: Partial<Snapshot>) {
    this.value = { ...this.value, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  testLogin = (role: User["role"]) =>
    this.run(async () => {
      const { user } = await api.testLogin(role);
      this.patch({ user });
      await this.refresh();
      this.connect();
    });
  login = (username: string, password: string) =>
    this.run(async () => {
      const { user } = await api.login(undefined, username, password);
      this.patch({ user });
      await this.refresh();
      this.connect();
    });
  logout = () =>
    this.run(async () => {
      await api.logout();
      this.resetAuth();
    });
  saveProfile = async (avatar: string | null): Promise<ProfileActionResult> => {
    if (this.value.busy)
      return {
        ok: false,
        error: "진행 중인 작업이 끝난 뒤 다시 시도해 주세요.",
      };
    const userId = this.value.user?.id;
    const user = await this.run(() => api.saveProfile(avatar));
    if (!user) return { ok: false, error: this.value.error };
    if (this.value.user?.id === userId) {
      this.patch({ user });
      if (this.value.loading) void this.refresh();
    }
    return { ok: true };
  };
  changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<ProfileActionResult> => {
    if (this.value.busy)
      return {
        ok: false,
        error: "진행 중인 작업이 끝난 뒤 다시 시도해 주세요.",
      };
    this.changingPassword = true;
    this.refreshVersion++;
    try {
      const result = await this.run(() =>
        api.changePassword(currentPassword, newPassword),
      );
      return result ? { ok: true } : { ok: false, error: this.value.error };
    } finally {
      this.changingPassword = false;
      void this.refresh();
    }
  };
  private resetAuth() {
    this.refreshVersion++;
    this.patch({
      user: null,
      sessions: [],
      status: null,
      projectId: "",
      selectedId: "",
      activeTab: "projects",
      tabs: ["projects"],
      frame: "",
      loading: false,
      connected: false,
    });
    history.replaceState(null, "", location.pathname);
    clearTimeout(this.retry);
    this.ws?.close();
    this.releaseFrame();
  }
  removeSessions = async (rows: { id: string }[]) => {
    const response = await fetch("/aiqa/api/studio/sessions/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: rows.map((row) => row.id),
        projectId: this.value.projectId || "default",
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "삭제하지 못했어요.");
    for (const row of rows) this.closeTab(row.id);
    await this.refresh();
  };
  clearError = () => this.patch({ error: "" });
  private fail = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) this.resetAuth();
    this.patch({
      error: error instanceof Error ? error.message : String(error),
    });
  };
  private update = (session: Session) => {
    const old = this.value.sessions.find((s) => s.id === session.id);
    if (old && old.updated > session.updated) return;
    const next = {
      ...old,
      ...session,
      observation: session.observation ?? old?.observation,
    };
    this.patch({
      sessions: [
        next,
        ...this.value.sessions.filter((s) => s.id !== next.id),
      ].sort((a, b) => b.updated - a.updated),
    });
    if (next.id === this.value.selectedId && next.state === "closed")
      this.showSaved(next);
  };
  private showSaved(session: Session) {
    const file = [...session.steps]
      .reverse()
      .find((step) => step.evidence)?.evidence;
    this.releaseFrame();
    this.patch({ frame: file ? evidenceUrl(session.id, file) : "" });
  }
  private releaseFrame() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = "";
  }
  private frame = (blob: Blob) => {
    this.releaseFrame();
    this.objectUrl = URL.createObjectURL(blob);
    this.patch({ frame: this.objectUrl });
  };
  private setProjectScope(projectId: string) {
    if (projectId === this.value.projectId) return false;
    this.refreshVersion++;
    this.patch({
      projectId,
      tabs: projectId ? ["dashboard"] : [],
      status: this.value.status ? { ...this.value.status, sessions: [] } : null,
      loading: true,
      error: "",
    });
    return true;
  }
  enterProject = (projectId: string) => {
    this.setProjectScope(projectId);
    this.patch({ tabs: ["dashboard"] });
    this.navigate("dashboard");
    void this.refresh();
  };
  createProject = (name: string) =>
    this.run(async () => {
      const project = await api.createProject(name);
      await this.refresh();
      this.enterProject(project.id);
    });
  renameProject = (
    name: string,
    source?: {
      repositories?: {
        sourceType: "git" | "svn";
        sourceUrl: string;
        description: string;
      }[];
      sourceUrl?: string;
      description?: string;
    },
  ) =>
    this.run(async () => {
      const id = this.value.projectId;
      if (!id) throw new Error("프로젝트를 선택해 주세요.");
      await api.renameProject(id, name, source);
      await this.refresh();
    });
  moveSession = (id: string, projectId: string) =>
    this.run(async () => {
      this.update(await api.moveSession(id, projectId));
      this.enterProject(projectId);
      this.select(id);
    });
  private routing = false;
  private updateRoute = () => {
    if (this.routing || new URLSearchParams(location.search).has("device"))
      return;
    const url = new URL(location.href);
    if (this.value.projectId) {
      url.searchParams.set("project", this.value.projectId);
      url.searchParams.set(
        "page",
        isPage(this.value.activeTab) ? this.value.activeTab : "dashboard",
      );
    } else {
      url.searchParams.delete("project");
      url.searchParams.delete("page");
    }
    url.hash = this.value.selectedId;
    const next = url.pathname + url.search + url.hash;
    if (next !== location.pathname + location.search + location.hash)
      history.pushState(null, "", next);
  };
  private restoreRoute = () => {
    const route = readProjectRoute();
    this.routing = true;
    this.setProjectScope(route.projectId);
    if (location.hash) this.select(location.hash.slice(1));
    else this.navigate((route.projectId ? route.page : "projects") as Page);
    this.routing = false;
    void this.refresh();
  };
  navigate = (page: Page) => {
    if (
      [
        "projects",
        "devices",
        "community",
        "device-admin",
        "user-admin",
        "ai-models",
        "app-admin",
      ].includes(page)
    )
      this.setProjectScope("");
    this.select("", false);
    this.patch(
      this.value.projectId
        ? openTab(this.value, page)
        : { tabs: [page], activeTab: page },
    );
    this.updateRoute();
    if (
      [
        "projects",
        "devices",
        "community",
        "device-admin",
        "user-admin",
        "ai-models",
        "app-admin",
      ].includes(page)
    )
      void this.refresh();
  };
  moveTab = (from: string, to: string) => {
    if (from === "dashboard" || to === "dashboard") return;
    const tabs = [...this.value.tabs];
    const source = tabs.indexOf(from),
      target = tabs.indexOf(to);
    if (source < 0 || target < 0 || source === target) return;
    tabs.splice(source, 1);
    tabs.splice(target, 0, from);
    this.patch({ tabs });
  };
  closeTab = (id: string) => {
    const next = closeTab(this.value, id);
    const changed = next.activeTab !== this.value.activeTab;
    this.patch(next);
    if (changed) {
      if (isPage(next.activeTab)) this.navigate(next.activeTab);
      else this.select(next.activeTab);
    }
  };
  select = (id: string, updateRoute = true) => {
    const session = this.value.sessions.find((s) => s.id === id);
    const scopeChanged = session
      ? this.setProjectScope(session.projectId || "default")
      : false;
    this.releaseFrame();
    this.patch({
      ...openTab(this.value, id || "projects"),
      selectedId: id,
      frame: "",
    });
    if (updateRoute) this.updateRoute();
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type: "watch", id }));
    if (session?.state === "closed") this.showSaved(session);
    else if (session) void this.loadFrame(id);
    if (scopeChanged) void this.refresh();
  };
  private async loadFrame(id: string) {
    try {
      const r = await fetch("/aiqa/api/studio/frame?id=" + id);
      if (r.ok) {
        const blob = await r.blob();
        if (this.value.selectedId === id) this.frame(blob);
      }
    } catch {
      /* Realtime reconnect provides the next frame. */
    }
  }
  refresh = async () => {
    if (!this.value.user || this.changingPassword) return;
    const version = ++this.refreshVersion;
    const user = this.value.user;
    const projectId = this.value.projectId;
    const isCurrent = () =>
      version === this.refreshVersion &&
      projectId === this.value.projectId &&
      user === this.value.user;
    try {
      const status = await api.status(projectId);
      if (!isCurrent()) return;
      this.patch({ status, loading: false });
      for (const session of status.sessions) this.update(session);
      if (this.value.selectedId) {
        const selected = this.value.sessions.find(
          (s) => s.id === this.value.selectedId,
        );
        if (!selected) this.navigate("projects");
        else if ((selected.projectId || "default") !== this.value.projectId)
          this.select(selected.id);
      }
    } catch (e) {
      if (!isCurrent()) return;
      this.patch({ loading: false });
      this.fail(e);
    }
  };
  run = async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    this.patch({ busy: true, error: "" });
    try {
      return await task();
    } catch (e) {
      this.fail(e);
      return undefined;
    } finally {
      this.patch({ busy: false });
    }
  };
  open = async (args: Parameters<typeof api.call<"qa_open">>[1]) =>
    this.run(async () => {
      const s = await api.call("qa_open", {
        ...args,
        projectId: this.value.projectId || "default",
      });
      this.update(s);
      this.select(s.id);
      await this.refresh();
      return s;
    });
  pauseExecution = async (id: string) => this.run(async () => {
    const session = await api.call("qa_pause", {id});
    this.update(session);
  });
  executeScenario = async (args: Parameters<typeof api.call<"qa_run">>[1]) => this.run(async () => {
    const session = await api.call("qa_run", {...args, projectId: this.value.projectId});
    this.update(session);
    await this.refresh();
    return session;
  });
  connectTest = async (id: string) => this.run(async () => {
    if (this.value.sessions.find((s) => s.id === id)?.plan) return;
    const session = await api.call("qa_observe", { id });
    this.update(session);
    if (this.value.selectedId === id) await this.loadFrame(id);
  });
  command = async (
    tool: "qa_agent" | "qa_pause" | "qa_close" | "qa_observe" | "qa_replay",
    goal?: string,
  ) =>
    this.run(async () => {
      const previousId = this.value.selectedId;
      const s = await api.call(tool, { id: previousId, goal });
      this.update(s);
      if (tool === "qa_replay") {
        this.terminalKeys.set(s.id, this.terminalKeys.get(previousId) || previousId);
        this.releaseFrame();
        this.patch({tabs: this.value.tabs.map(id => id === previousId ? s.id : id), selectedId: s.id, activeTab: s.id, frame: ""});
        this.updateRoute();
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({type:"watch",id:s.id}));
        void this.loadFrame(s.id);
      }
      if (tool === "qa_observe") await this.loadFrame(s.id);
      if (tool === "qa_close" || tool === "qa_replay") await this.refresh();
    });
  action = async (action: Action) =>
    this.run(async () => {
      const id = this.value.selectedId;
      if (this.ws?.readyState === WebSocket.OPEN) {
        const requestId = crypto.randomUUID();
        await new Promise<Step>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pending.delete(requestId);
            reject(new Error("응답이 늦어요. 실행 기록을 확인해 주세요"));
          }, 90000);
          this.pending.set(requestId, { resolve, reject, timer });
          this.ws!.send(
            JSON.stringify({ type: "action", id, requestId, action }),
          );
        });
      } else await api.call("qa_action", { id, action });
      const s = await api.call("qa_observe", { id });
      this.update(s);
      await this.loadFrame(id);
    });
  private connect = () => {
    if (this.stopped || !this.value.user) return;
    if (this.ws && this.ws.readyState < WebSocket.CLOSING) return;
    const ws = new WebSocket(
      (location.protocol === "https:" ? "wss:" : "ws:") +
        "//" +
        location.host +
        "/aiqa/studio/ws",
    );
    this.ws = ws;
    ws.onopen = () => {
      this.patch({ connected: true });
      ws.send(JSON.stringify({ type: "watch", id: this.value.selectedId }));
      void this.refresh();
      if (this.value.selectedId) void this.connectTest(this.value.selectedId);
    };
    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const active = this.value.sessions.find(
          (s) => s.id === this.value.selectedId,
        );
        if (active && active.state !== "closed") this.frame(event.data);
        return;
      }
      try {
        const msg = JSON.parse(String(event.data)) as {
          session?: Session;
          type: string;
          requestId?: string;
          error?: string;
          result: Step;
        };
        if (msg.session) this.update(msg.session);
        if (msg.type === "reply" && msg.requestId) {
          const p = this.pending.get(msg.requestId);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(msg.requestId);
            if (msg.error) p.reject(new Error(msg.error));
            else p.resolve(msg.result);
          }
        }
      } catch {
        this.fail("실시간 응답을 읽지 못했어요");
      }
    };
    ws.onclose = () => {
      this.patch({ connected: false });
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("연결이 끊겼어요. 실행 기록을 확인해 주세요"));
      }
      this.pending.clear();
      if (!this.stopped && this.value.user)
        this.retry = setTimeout(this.connect, 3000);
    };
  };
  start = () => {
    this.stopped = false;
    window.addEventListener("popstate", this.restoreRoute);
    void api
      .me()
      .then(async ({ user }) => {
        if (this.stopped) return;
        this.patch({ user, loading: !!user });
        if (user) {
          await this.refresh();
          this.connect();
        }
      })
      .catch((error) => {
        this.fail(error);
        this.patch({ loading: false });
      });
    this.poll = setInterval(() => void this.refresh(), 15000);
    return () => {
      this.stopped = true;
      window.removeEventListener("popstate", this.restoreRoute);
      this.refreshVersion++;
      clearTimeout(this.retry);
      clearInterval(this.poll);
      this.ws?.close();
      this.releaseFrame();
    };
  };
}
