import { db, ensureDb } from "./repository.ts";
let schema: Promise<unknown> | undefined;
async function ready() {
  await ensureDb();
  schema ??=
    db!`create table if not exists heimdall_ai_settings (id text primary key, model text not null)`.catch(
      (e: unknown) => {
        schema = undefined;
        throw e;
      },
    );
  await schema;
}
export async function aiModel() {
  await ready();
  const [row] =
    await db!`select model from heimdall_ai_settings where id='default'`;
  return {
    model: String(
      row?.model ||
        process.env.AIQA_LLM_MODEL ||
        "deepseek/deepseek-v4.1-flash",
    ),
    provider: "OpenRouter",
    configured: !!process.env.AIQA_OPENROUTER_API_KEY,
  };
}
export async function saveAiModel(model: unknown) {
  if (
    typeof model !== "string" ||
    !/^[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:/-]+$/.test(model) ||
    model.length > 200
  )
    throw new Error("공급자/모델 형식의 모델 ID를 입력해 주세요.");
  await ready();
  await db!`insert into heimdall_ai_settings (id,model) values ('default',${model}) on conflict(id) do update set model=excluded.model`;
}
