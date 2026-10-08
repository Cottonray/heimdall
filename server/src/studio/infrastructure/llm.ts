import { aiModel } from "./ai-model.ts";
export async function complete(system: string, content: string) {
  const key = process.env.AIQA_OPENROUTER_API_KEY;
  if (!key) throw new Error("OpenRouter 키가 설정되지 않았어요");
  const r = await fetch(
    `${process.env.AIQA_OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "x-title": "AI QA Studio",
      },
      body: JSON.stringify({
        model: (await aiModel()).model,
        reasoning: { enabled: false },
        temperature: 0.1,
        max_tokens: 1200,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
  if (!r.ok)
    throw new Error(
      `AI 호출 ${r.status}${r.status === 402 ? ": 사용 한도를 확인해 주세요" : ""}`,
    );
  const data = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
    },
    raw = data.choices?.[0]?.message?.content || "";
  return JSON.parse(raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
}
