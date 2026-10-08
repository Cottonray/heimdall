import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DIR } from "./config.ts";
import { db, ensureDb } from "./repository.ts";
const OPENROUTER = "https://openrouter.ai/api/v1";
type Provider = "openrouter" | "openai-compatible";
type Settings = {
  provider: Provider;
  baseUrl: string;
  model: string;
  keys: Record<string, string>;
};
const file = path.join(DIR, "ai-provider-settings.json");
let schema: Promise<unknown> | undefined;
let saving: Promise<unknown> = Promise.resolve();
async function settings(): Promise<Settings> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Settings;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("AI 설정을 읽지 못했어요.");
  }
  await ensureDb();
  schema ??=
    db!`create table if not exists heimdall_ai_settings (id text primary key, model text not null)`.catch(
      (e) => {
        schema = undefined;
        throw e;
      },
    );
  await schema;
  const [row] =
    await db!`select model from heimdall_ai_settings where id='default'`;
  return {
    provider: "openrouter",
    baseUrl: (process.env.AIQA_OPENROUTER_BASE_URL || OPENROUTER).replace(
      /\/$/,
      "",
    ),
    model: String(
      row?.model ||
        process.env.AIQA_LLM_MODEL ||
        "deepseek/deepseek-v4.1-flash",
    ),
    keys: {},
  };
}
function keyFor(value: Settings) {
  const identity = `${value.provider}:${value.baseUrl}`;
  return (
    value.keys[identity] ??
    (value.provider === "openrouter" &&
    value.baseUrl ===
      (process.env.AIQA_OPENROUTER_BASE_URL || OPENROUTER).replace(/\/$/, "")
      ? process.env.AIQA_OPENROUTER_API_KEY || ""
      : "")
  );
}
export async function aiConnection() {
  const value = await settings();
  return {
    provider: value.provider,
    baseUrl: value.baseUrl,
    model: value.model,
    apiKey: keyFor(value),
  };
}
export async function aiModel() {
  const { apiKey, ...value } = await aiConnection();
  return { ...value, configured: !!apiKey };
}
export async function saveAiModel(data: {
  provider?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKey?: unknown;
}) {
  const operation = saving
    .catch(() => {})
    .then(async () => {
      if (
        data.provider !== "openrouter" &&
        data.provider !== "openai-compatible"
      )
        throw new Error("API 제공자를 선택해 주세요.");
      if (
        typeof data.model !== "string" ||
        !data.model.trim() ||
        data.model.length > 200 ||
        /[\r\n]/.test(data.model)
      )
        throw new Error("모델 ID를 확인해 주세요.");
      let baseUrl = OPENROUTER;
      if (data.provider === "openai-compatible") {
        try {
          const url = new URL(String(data.baseUrl));
          if (
            !["https:", "http:"].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash
          )
            throw new Error();
          baseUrl = url.toString().replace(/\/+$/, "");
          if (baseUrl.endsWith("/chat/completions")) throw new Error();
        } catch {
          throw new Error(
            "API 기본 주소를 입력해 주세요. 예: https://api.example.com/v1",
          );
        }
      }
      if (
        data.apiKey !== undefined &&
        (typeof data.apiKey !== "string" ||
          data.apiKey.length > 8192 ||
          /[\r\n]/.test(data.apiKey))
      )
        throw new Error("API 키를 확인해 주세요.");
      const current = await settings();
      const next: Settings = {
        provider: data.provider,
        baseUrl,
        model: data.model.trim(),
        keys: { ...current.keys },
      };
      if (typeof data.apiKey === "string" && data.apiKey.trim())
        next.keys[`${next.provider}:${next.baseUrl}`] = data.apiKey.trim();
      await mkdir(DIR, { recursive: true });
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      await rename(temp, file);
    });
  saving = operation;
  await operation;
}
