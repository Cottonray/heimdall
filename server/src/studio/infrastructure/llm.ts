import { aiConnection } from "./ai-model.ts";
export async function complete(system: string, content: string, maxTokens = 1200) {
  const connection = await aiConnection();
  if (connection.provider === "openrouter" && !connection.apiKey)
    throw new Error("OpenRouter 키가 설정되지 않았어요");
  const r = await fetch(`${connection.baseUrl}/chat/completions`, {
    method: "POST",
    redirect: "error",
    headers: {
      ...(connection.apiKey
        ? { authorization: `Bearer ${connection.apiKey}` }
        : {}),
      "content-type": "application/json",
      "x-title": "AI QA Studio",
    },
    body: JSON.stringify({
      model: connection.model,
      ...(connection.provider === "openrouter"
        ? { reasoning: { enabled: false } }
        : {}),
      temperature: 0.1,
      max_tokens: Math.min(4000, Math.max(1200, maxTokens)),
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
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
