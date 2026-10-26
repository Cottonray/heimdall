import type {
  ToolName,
  ToolArguments,
  ToolResults,
  StudioStatus,
  Project,
  Session,
  User,
  TestDataEntry,
} from "../../../contracts/studio";
export const API = "/aiqa/api/studio";
export type ProfileActionResult = { ok: boolean; error?: string };
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => ({ error: "로그인 또는 서버 연결을 확인해 주세요" }))) as {
      error?: string;
    };
    throw new ApiError(
      body.error || "요청을 처리하지 못했어요",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}
async function post<T>(path: string, body: unknown): Promise<T> {
  return fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(json<T>);
}
export const api = {
  testData: (projectId: string, signal?: AbortSignal) =>
    fetch(API + "/test-data?" + new URLSearchParams({ projectId }), {
      signal,
    }).then(json<TestDataEntry[]>),
  me: () => fetch(API + "/auth/me").then(json<{ user: User | null }>),
  testLogin: (role: User["role"]) =>
    post<{ user: User }>("/auth/test-login", { role }),
  login: (role: User["role"] | undefined, username: string, password: string) =>
    post<{ user: User }>("/auth/login", { role, username, password }),
  logout: () => post("/auth/logout", {}),
  saveProfile: (avatar: string | null) => post<User>("/profile", { avatar }),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: true }>("/profile/password", { currentPassword, newPassword }),
  status: (projectId = "") =>
    fetch(
      API +
        "/status" +
        (projectId ? "?projectId=" + encodeURIComponent(projectId) : ""),
    ).then(json<StudioStatus>),
  createProject: (name: string) =>
    fetch(API + "/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(json<Project>),
  renameProject: (
    id: string,
    name: string,
    source?: Pick<Project, "repositories" | "description" | "appPackage">,
  ) => post<Project>("/projects", { id, name, source }),
  moveSession: (id: string, projectId: string) =>
    fetch(API + "/project-assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, projectId }),
    }).then(json<Session>),
  call: <K extends ToolName>(tool: K, args: ToolArguments = {}) =>
    fetch(API + "/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, arguments: args }),
    }).then(json<ToolResults[K]>),
};
export function evidenceUrl(id: string, file: string) {
  return API + "/evidence?" + new URLSearchParams({ id, file });
}
export function download(content: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
