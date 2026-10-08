import type {
  ToolName,
  ToolArguments,
  ToolResults,
  StudioStatus,
} from "../../../contracts/studio";
export const API = "/aiqa/api/studio";
async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => ({ error: "로그인 또는 서버 연결을 확인해 주세요" }))) as {
      error?: string;
    };
    throw new Error(body.error || "요청을 처리하지 못했어요");
  }
  return response.json() as Promise<T>;
}
export const api = {
  status: () => fetch(API + "/status").then(json<StudioStatus>),
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
