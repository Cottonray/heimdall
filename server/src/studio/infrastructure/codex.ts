import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { aiConnection } from "./ai-model.ts";

// The model receives no tools. Only text is returned to Codex, so it cannot
// invoke shell, filesystem, browser, MCP, or delegation tools. The application
// validates and executes the resulting Action in the already selected session.
export async function createScenarioCodex(
  override?: Awaited<ReturnType<typeof aiConnection>>,
  terminalReply?: (
    messages: { role: string; content: string }[],
  ) => Promise<string>,
) {
  const connection = override || (await aiConnection());
  const home = await mkdtemp(path.join(tmpdir(), "heimdall-codex-"));
  const token = randomUUID();
  let thread = "";
  let child: ReturnType<typeof spawn> | undefined;
  const gateway = createServer(async (req, res) => {
    try {
      if (
        req.method !== "POST" ||
        req.url !== "/responses" ||
        req.headers.authorization !== `Bearer ${token}`
      ) {
        res.writeHead(403).end();
        return;
      }
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 1_000_000) throw new Error("Input too large");
      }
      const body = JSON.parse(raw) as {
        model?: string;
        instructions?: string;
        input?: {
          type?: string;
          role?: string;
          content?: { type: string; text?: string }[] | string;
        }[];
      };
      if (body.model && body.model !== connection.model) {
        res.writeHead(400, {"content-type":"application/json"}).end(JSON.stringify({error:{message:"모델은 AI 설정에서 선택한 모델로 고정돼요."}}));
        return;
      }
      const messages = [
        {
          role: "system",
          content: body.instructions || "Return a QA action JSON object only.",
        },
      ];
      for (const item of body.input || []) {
        if (item.type && item.type !== "message") continue;
        const content =
          typeof item.content === "string"
            ? item.content
            : (item.content || []).map((c) => c.text || "").join("\n");
        if (content)
          messages.push({
            role: item.role === "assistant" ? "assistant" : "user",
            content,
          });
      }
      let message: { content?: string; tool_calls?: unknown[] } | undefined;
      if (terminalReply) message = { content: await terminalReply(messages) };
      else {
        const upstream = await fetch(`${connection.baseUrl}/chat/completions`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(60000),
          headers: {
            "content-type": "application/json",
            ...(connection.apiKey
              ? { authorization: `Bearer ${connection.apiKey}` }
              : {}),
          },
          body: JSON.stringify({
            model: connection.model,
            ...(connection.provider === "openrouter"
              ? { reasoning: { enabled: false } }
              : {}),
            messages,
            stream: false,
            max_tokens: 1600,
            temperature: 0.1,
          }),
        });
        if (!upstream.ok)
          throw new Error(`AI provider HTTP ${upstream.status}`);
        const result = (await upstream.json()) as {
          choices?: {
            message?: { content?: string; tool_calls?: unknown[] };
          }[];
        };
        message = result.choices?.[0]?.message;
        if (!message?.content || message.tool_calls?.length)
          throw new Error("Only text responses are permitted");
      }
      if (!message?.content) throw new Error("Empty response");
      const id = `resp_${randomUUID()}`,
        itemId = `msg_${randomUUID()}`;
      const item = {
        id: itemId,
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: message.content, annotations: [] },
        ],
      };
      const response = {
        id,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: connection.model,
        output: [item],
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      };
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
      });
      let sequence = 0;
      const event = (type: string, data: object) =>
        res.write(
          `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`,
        );
      event("response.created", {
        response: { ...response, status: "in_progress", output: [] },
      });
      event("response.output_item.added", {
        output_index: 0,
        item: { ...item, status: "in_progress", content: [] },
      });
      event("response.content_part.added", {
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      });
      event("response.output_text.delta", {
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        delta: message.content,
      });
      event("response.output_text.done", {
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        text: message.content,
      });
      event("response.content_part.done", {
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        part: item.content[0],
      });
      event("response.output_item.done", { output_index: 0, item });
      event("response.completed", { response });
      res.end();
    } catch {
      res.writeHead(502, { "content-type": "application/json" }).end(
        JSON.stringify({
          error: {
            message:
              "AI 설정 연결에 실패했어요. 제공자와 모델 설정을 확인해 주세요.",
          },
        }),
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    gateway.once("error", reject);
    gateway.listen(0, terminalReply ? "0.0.0.0" : "127.0.0.1", resolve);
  });
  const address = gateway.address();
  if (!address || typeof address === "string")
    throw new Error("Codex gateway unavailable");
  return {
    terminalToken: token,
    // Gateway capabilities, not an assertion about the provider's maximum context.
    terminalCatalog: { models: [{
      slug: connection.model, display_name: connection.model,
      description: "기본모델.",
      default_reasoning_level: "none", supported_reasoning_levels: [],
      shell_type: "shell_command", visibility: "list", supported_in_api: true,
      priority: 0, upgrade: null, base_instructions: "Help write and run this HEIMDALL test only. Respond in Korean.",
      model_messages: {instructions_template: "Help write and run this HEIMDALL test only. Respond in Korean.", instructions_variables: {personality_default:"",personality_friendly:"",personality_pragmatic:""}, approvals:null},
      supports_reasoning_summary_parameter: false, supports_reasoning_summaries: false, support_verbosity: false,
      default_reasoning_summary: "none", default_verbosity: null,
      apply_patch_tool_type: null, truncation_policy: {mode:"tokens",limit:10000},
      context_window: 32000, effective_context_window_percent: 90,
      input_modalities: ["text"], experimental_supported_tools: [],
      supports_image_detail_original: false, supports_search_tool: false,
      supports_reasoning_effort_updates: false, supports_parallel_tool_calls: false, use_responses_lite: false
    }] },
    terminalConfig: `model = ${JSON.stringify(connection.model)}
model_provider = "heimdall"
web_search = "disabled"
check_for_update_on_startup = false
[tui]
show_tooltips = false
[features]
shell_tool = false
multi_agent = false
apps = false
hooks = false
memories = false
[model_providers.heimdall]
name = "Heimdall"
base_url = "http://aiqa:${address.port}"
env_key = "HEIMDALL_GATEWAY_TOKEN"
wire_api = "responses"
requires_openai_auth = false
`,
    async complete(system: string, content: string) {
      const args = [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "-c",
        'model_provider="heimdall"',
        "-c",
        `model_providers.heimdall.name="Heimdall"`,
        "-c",
        `model_providers.heimdall.base_url="http://127.0.0.1:${address.port}"`,
        "-c",
        'model_providers.heimdall.env_key="HEIMDALL_GATEWAY_TOKEN"',
        "-c",
        'model_providers.heimdall.wire_api="responses"',
        "-c",
        "model_providers.heimdall.requires_openai_auth=false",
        "-c",
        'web_search="disabled"',
        "-c",
        "features.shell_tool=false",
        "-c",
        "features.multi_agent=false",
        "-c",
        "features.apps=false",
        "-c",
        "features.hooks=false",
        "-c",
        "features.memories=false",
        "-m",
        connection.model,
      ];
      if (thread) args.push("resume", thread, "-");
      else
        args.push(
          "--sandbox",
          "read-only",
          "--ignore-user-config",
          "--ignore-rules",
          "-",
        );
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        let output = "",
          answer = "";
        child = spawn(
          process.env.AIQA_CODEX_BIN || "/opt/aiqa/server/codex/bin/codex",
          args,
          {
            cwd: home,
            env: {
              PATH: "/usr/local/bin:/usr/bin:/bin",
              HOME: home,
              CODEX_HOME: home,
              HEIMDALL_GATEWAY_TOKEN: token,
            },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        const timer = setTimeout(() => {
          child?.kill("SIGKILL");
          reject(new Error("Codex 응답 시간이 초과됐어요."));
        }, 90000);
        child.stdout!.on("data", (chunk: Buffer) => {
          output += chunk.toString();
          if (output.length > 1_000_000) {
            child?.kill("SIGKILL");
            return;
          }
          let end: number;
          while ((end = output.indexOf("\n")) >= 0) {
            const line = output.slice(0, end);
            output = output.slice(end + 1);
            try {
              const event = JSON.parse(line);
              if (event.type === "thread.started") thread = event.thread_id;
              if (
                event.type === "item.completed" &&
                event.item?.type === "agent_message"
              )
                answer = event.item.text;
            } catch {
              /* Ignore non-protocol stdout. */
            }
          }
        });
        child.stderr!.resume();
        child.once("error", () => {
          clearTimeout(timer);
          reject(new Error("Codex 실행기를 시작하지 못했어요."));
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          if (code !== 0 || !answer) {
            reject(
              new Error(
                "Codex 시나리오 응답을 받지 못했어요. AI 설정을 확인해 주세요.",
              ),
            );
            return;
          }
          try {
            resolve(
              JSON.parse(
                answer.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
              ),
            );
          } catch {
            reject(
              new Error("Codex가 유효한 테스트 동작을 반환하지 않았어요."),
            );
          }
        });
        child.stdin!.end(
          system +
            "\nReturn only the requested JSON. No tool calls.\n" +
            content,
        );
      });
    },
    async close() {
      child?.kill("SIGKILL");
      gateway.closeAllConnections();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
      await rm(home, { recursive: true, force: true });
    },
  };
}
