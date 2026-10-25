import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type SourceSettings = {
  appPackage?: string;
  sourceType?: "git" | "svn";
  sourceUrl?: string;
  description?: string;
};
export function normalizeSource(
  data: SourceSettings,
): { sourceType: "git" | "svn"; sourceUrl: string; description: string } {
  const sourceType = data.sourceType ?? "git";
  const sourceUrl = (data.sourceUrl ?? "").trim();
  const description = (data.description ?? "").trim();
  if (
    !["git", "svn"].includes(sourceType) ||
    sourceUrl.length > 2000 ||
    description.length > 5000
  )
    throw new Error("저장소 종류와 설명 길이를 확인해 주세요.");
  if (sourceUrl) {
    const url = new URL(sourceUrl);
    const hosts = (
      process.env.AIQA_SOURCE_HOSTS || "github.com,gitlab.com,svn.apache.org"
    )
      .split(",")
      .map((h) => h.trim());
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !hosts.includes(url.hostname)
    )
      throw new Error(
        "인증정보 없는 HTTPS 저장소 주소를 사용해 주세요. 사내 저장소 호스트는 서버의 AIQA_SOURCE_HOSTS에 등록해야 해요.",
      );
  }
  return { sourceType, sourceUrl, description };
}
const sourceFile = (name: string) =>
  (/\.(tsx?|jsx?|java|kt|swift|vue|svelte|html|md|feature)$/i.test(name) ||
    /(^|\/)readme$/i.test(name)) &&
  !/(^|\/)(node_modules|vendor|dist|build|\.git)(\/|$)/.test(name) &&
  !/(secret|credential|\.env|lock)/i.test(name);
export async function readProjectSource(settings: SourceSettings) {
  const config = normalizeSource(settings);
  if (!config.sourceUrl)
    return { description: config.description, files: [], truncated: false };
  // Operator-only transport mappings support repositories behind an SSO gateway.
  // Never return transport endpoints or credentials in project/source responses.
  let transportUrl = config.sourceUrl;
  let authorization = "";
  if (process.env.AIQA_SOURCE_CONNECTIONS_FILE) {
    try {
      const connections = JSON.parse(await readFile(process.env.AIQA_SOURCE_CONNECTIONS_FILE, "utf8"));
      const connection = connections[config.sourceUrl];
      if (connection) {
        const endpoint = new URL(connection.url);
        if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
          throw new Error("Invalid transport");
        transportUrl = endpoint.href;
        authorization = connection.authorization || "";
        if (typeof authorization !== "string" || /[\r\n]/.test(authorization)) throw new Error("Invalid credentials");
      }
    } catch {
      throw new Error("서버의 저장소 연결 설정을 확인해 주세요.");
    }
  }
  const folder = await mkdtemp(path.join(tmpdir(), "heimdall-source-"));
  const deadline = Date.now() + 60000;
  const run = (binary: string, args: string[]) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        binary,
        args,
        {
          cwd: folder,
          timeout: Math.max(1, deadline - Date.now()),
          maxBuffer: 2_000_000,
          env: {
            PATH: process.env.PATH,
            HOME: folder,
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_TERMINAL_PROMPT: "0",
            GIT_ALLOW_PROTOCOL: transportUrl.startsWith("http:") ? "http:https" : "https",
            ...(authorization ? {
              GIT_CONFIG_COUNT: "1",
              GIT_CONFIG_KEY_0: `http.${transportUrl}.extraHeader`,
              GIT_CONFIG_VALUE_0: `Authorization: ${authorization}`,
            } : {}),
          },
        },
        (error, stdout) =>
          error
            ? reject(
                new Error(
                  "소스를 읽지 못했어요. 저장소 주소·접근 권한과 서버의 Git/SVN 설치를 확인해 주세요.",
                ),
              )
            : resolve(stdout),
      );
    });
  try {
    let names: string[];
    let revision: string;
    if (config.sourceType === "git") {
      await run("git", [
        "-c",
        "http.followRedirects=false",
        "clone",
        "--depth=1",
        "--no-checkout",
        "--",
        transportUrl,
        "repo",
      ]);
      revision = (await run("git", ["-C", "repo", "rev-parse", "HEAD"])).trim();
      names = (
        await run("git", ["-C", "repo", "ls-tree", "-r", "--name-only", "HEAD"])
      ).split("\n");
    } else {
      revision = (
        await run("svn", [
          "info",
          "--non-interactive",
          "--no-auth-cache",
          "--show-item",
          "revision",
          config.sourceUrl,
        ])
      ).trim();
      names = (
        await run("svn", [
          "list",
          "--recursive",
          "--non-interactive",
          "--no-auth-cache",
          "-r",
          revision,
          config.sourceUrl,
        ])
      ).split("\n");
    }
    const candidates = names
      .filter(sourceFile)
      .sort(
        (a, b) =>
          Number(!/readme|test|screen|page|route/i.test(a)) -
            Number(!/readme|test|screen|page|route/i.test(b)) ||
          a.localeCompare(b),
      );
    const files: { path: string; content: string }[] = [];
    let remaining = 80000;
    for (const name of candidates.slice(0, 40)) {
      if (remaining <= 0) break;
      const text =
        config.sourceType === "git"
          ? await run("git", ["-C", "repo", "show", `HEAD:${name}`])
          : await run("svn", [
              "cat",
              "--non-interactive",
              "--no-auth-cache",
              "-r",
              revision,
              `${config.sourceUrl.replace(/\/$/, "")}/${name.split("/").map(encodeURIComponent).join("/")}@${revision}`,
            ]);
      const content = text.slice(0, Math.min(remaining, 8000));
      remaining -= content.length;
      files.push({ path: name, content });
    }
    if (!files.length) throw new Error("참고할 소스 파일을 찾지 못했어요.");
    return {
      description: config.description,
      url: config.sourceUrl,
      revision,
      files,
      truncated: true,
    };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export function normalizeProjectSources(
  data: SourceSettings & { repositories?: SourceSettings[] },
) {
  if (
    data.repositories !== undefined &&
    (!Array.isArray(data.repositories) || data.repositories.length > 5)
  )
    throw new Error("저장소는 최대 5개까지 등록할 수 있어요.");
  const entries = data.repositories ?? (data.sourceUrl ? [data] : []);
  const repositories = entries.map((entry) => {
    const normalized = normalizeSource(entry);
    if (!normalized.sourceUrl) throw new Error("저장소 주소를 입력해 주세요.");
    return normalized;
  });
  if (
    new Set(repositories.map((r) => r.sourceUrl)).size !== repositories.length
  )
    throw new Error("같은 저장소 주소를 중복 등록할 수 없어요.");
  return {
    appPackage: normalizeAppPackage(data.appPackage),
    description: normalizeSource({ description: data.description }).description,
    repositories,
  };
}
export function normalizeAppPackage(value?: string) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > 200 || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value))
    throw new Error("Android 앱 패키지 이름을 확인해 주세요.");
  return value;
}
export async function readProjectSources(
  data: SourceSettings & { repositories?: SourceSettings[] },
) {
  const settings = normalizeProjectSources(data);
  const repositories = [];
  for (const repository of settings.repositories)
    repositories.push(await readProjectSource(repository));
  return { description: settings.description, repositories };
}
