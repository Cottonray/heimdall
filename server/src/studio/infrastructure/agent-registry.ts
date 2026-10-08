import { readFile } from "node:fs/promises";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DeviceInfo } from "../../../../contracts/studio.ts";
type Command = { id: string; path: string; body?: unknown };
type Agent = { seen: number; devices: DeviceInfo[]; commands: Command[] };
const agents = new Map<string, Agent>();
const pending = new Map<
  string,
  {
    agentId: string;
    resolve: (value: Buffer) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
export function agentDevices(): DeviceInfo[] {
  return [...agents.values()].flatMap((agent) =>
    agent.devices.map((device) =>
      Date.now() - agent.seen < 10000
        ? device
        : { ...device, state: "offline", ready: false },
    ),
  );
}
export function agentRequest(path: string, body?: unknown): Promise<Buffer> {
  const serial = new URL(path, "http://localhost").searchParams.get("serial");
  const entry = [...agents.entries()].find(
    ([, a]) =>
      Date.now() - a.seen < 10000 &&
      a.devices.some((d) => d.serial === serial && d.ready),
  );
  if (!entry) return Promise.reject(new Error("슬레이브 연결을 확인해 주세요"));
  const [agentId, agent] = entry;
  if (agent.commands.length >= 32)
    return Promise.reject(new Error("기기 요청이 많아요"));
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(
      () => {
        pending.delete(id);
        agent.commands = agent.commands.filter((c) => c.id !== id);
        reject(new Error("슬레이브 응답이 없어요"));
      },
      path.startsWith("/prepare") ? 180000 : 15000,
    );
    pending.set(id, { agentId, resolve, reject, timer });
    agent.commands.push({ id, path, body });
  });
}
export async function handleAgent(req: IncomingMessage, res: ServerResponse) {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") {
    send(405, {});
    return;
  }
  try {
    const config = JSON.parse(
      await readFile(
        process.env.HEIMDALL_AGENTS_FILE ||
          "/opt/aiqa/server/agents.local.json",
        "utf8",
      ),
    ) as { agents: { id: string; tokenHash: string; serials: string[] }[] };
    const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
    const digest = createHash("sha256").update(token).digest();
    const permitted = config.agents.find(
      (a) =>
        /^[a-f0-9]{64}$/.test(a.tokenHash) &&
        timingSafeEqual(Buffer.from(a.tokenHash, "hex"), digest),
    );
    if (!permitted) {
      send(403, {});
      return;
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 8000000) {
        send(413, {});
        return;
      }
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (
      data.agentId !== permitted.id ||
      !Array.isArray(data.devices) ||
      data.devices.length > 20 ||
      !Array.isArray(data.responses) ||
      data.responses.length > 64
    ) {
      send(400, {});
      return;
    }
    const devices: DeviceInfo[] = data.devices.map((d: DeviceInfo) => {
      if (
        !permitted.serials.includes(d.serial) ||
        d.platform !== "ios" ||
        typeof d.model !== "string" ||
        d.model.length > 120
      )
        throw new Error();
      return {
        serial: d.serial,
        platform: "ios",
        model: d.model,
        kind: "emulator",
        state: d.ready === true ? "device" : "offline",
        ready: d.ready === true,
        current: true,
        selectable: true,
      };
    });
    if (
      [...agents.entries()].some(
        ([id, a]) =>
          id !== permitted.id &&
          Date.now() - a.seen < 10000 &&
          a.devices.some((d) =>
            devices.some((next) => next.serial === d.serial),
          ),
      )
    ) {
      send(409, {});
      return;
    }
    const agent = agents.get(permitted.id) || {
      seen: 0,
      devices: [],
      commands: [],
    };
    agent.seen = Date.now();
    agent.devices = devices;
    agents.set(permitted.id, agent);
    for (const result of data.responses) {
      const item = pending.get(result.id);
      if (!item || item.agentId !== permitted.id) continue;
      clearTimeout(item.timer);
      pending.delete(result.id);
      if (typeof result.result === "string")
        item.resolve(Buffer.from(result.result, "base64"));
      else item.reject(new Error("슬레이브 조작을 완료하지 못했어요"));
    }
    const commands = agent.commands.splice(0);
    send(200, { commands });
  } catch {
    send(503, { error: "에이전트 등록 설정을 확인해 주세요" });
  }
}
