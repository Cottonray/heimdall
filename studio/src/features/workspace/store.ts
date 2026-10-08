import type {
  Action,
  Session,
  StudioStatus,
  Step,
} from "../../../../contracts/studio";
import { api, evidenceUrl } from "@/lib/api";
type Snapshot = {
  sessions: Session[];
  status: StudioStatus | null;
  selectedId: string;
  loading: boolean;
  busy: boolean;
  connected: boolean;
  error: string;
  frame: string;
};
export class WorkspaceStore {
  private value: Snapshot = {
    sessions: [],
    status: null,
    selectedId: location.hash.slice(1),
    loading: true,
    busy: false,
    connected: false,
    error: "",
    frame: "",
  };
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private poll: ReturnType<typeof setInterval> | undefined;
  private stopped = true;
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
  clearError = () => this.patch({ error: "" });
  private fail = (error: unknown) =>
    this.patch({
      error: error instanceof Error ? error.message : String(error),
    });
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
  select = (id: string) => {
    this.releaseFrame();
    this.patch({ selectedId: id, frame: "" });
    history.replaceState(null, "", location.pathname + (id ? "#" + id : ""));
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type: "watch", id }));
    const session = this.value.sessions.find((s) => s.id === id);
    if (session?.state === "closed") this.showSaved(session);
    else if (session) void this.loadFrame(id);
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
    try {
      const status = await api.status();
      this.patch({ status, loading: false });
      for (const session of status.sessions) this.update(session);
      if (
        this.value.selectedId &&
        !status.sessions.some((s) => s.id === this.value.selectedId)
      )
        this.select("");
    } catch (e) {
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
      const s = await api.call("qa_open", args);
      this.update(s);
      this.select(s.id);
      await this.refresh();
    });
  command = async (
    tool: "qa_agent" | "qa_pause" | "qa_close" | "qa_observe" | "qa_replay",
    goal?: string,
  ) =>
    this.run(async () => {
      const s = await api.call(tool, { id: this.value.selectedId, goal });
      this.update(s);
      if (tool === "qa_replay") this.select(s.id);
      if (tool === "qa_observe") await this.loadFrame(s.id);
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
    if (this.stopped) return;
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
      if (!this.stopped) this.retry = setTimeout(this.connect, 3000);
    };
  };
  start = () => {
    this.stopped = false;
    void this.refresh();
    this.connect();
    this.poll = setInterval(() => void this.refresh(), 15000);
    return () => {
      this.stopped = true;
      clearTimeout(this.retry);
      clearInterval(this.poll);
      this.ws?.close();
      this.releaseFrame();
    };
  };
}
