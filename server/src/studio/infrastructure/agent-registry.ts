import { readFile } from "node:fs/promises";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DeviceInfo } from "../../../../contracts/studio.ts";
import type { WsConnection } from "../../ws.ts";
const sockets = new Map<string, WsConnection>();
type Command = { id: string; path: string; body?: unknown };
type Agent = { seen: number; devices: DeviceInfo[]; commands: Command[] };
const waiting = new Map<string, () => void>();
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
  if ([...pending.values()].filter((p) => p.agentId === agentId).length >= 32)
    return Promise.reject(new Error("기기 요청이 많아요"));
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(
      () => {
        pending.delete(id);
        agent.commands = agent.commands.filter((c) => c.id !== id);
        reject(new Error("슬레이브 응답이 없어요"));
      },
      path.startsWith("/prepare") || path.startsWith("/app-install")
        ? 180000
        : 15000,
    );
    pending.set(id, { agentId, resolve, reject, timer });
    const socket = sockets.get(agentId);
    if (socket?.isOpen)
      socket.send(JSON.stringify({ commands: [{ id, path, body }] }));
    else {
      agent.commands.push({ id, path, body });
      waiting.get(agentId)?.();
    }
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
    if (sockets.get(permitted.id)?.isOpen) {
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
    if (data.wait === true && agent.commands.length === 0 && !res.destroyed) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          res.off("close", finish);
          if (waiting.get(permitted.id) === finish)
            waiting.delete(permitted.id);
          resolve();
        };
        const timer = setTimeout(finish, 4000);
        waiting.get(permitted.id)?.();
        waiting.set(permitted.id, finish);
        res.once("close", finish);
      });
    }
    if (res.destroyed) return;
    const commands = data.responseOnly === true ? [] : agent.commands.splice(0);
    send(200, { commands });
  } catch {
    send(503, { error: "에이전트 등록 설정을 확인해 주세요" });
  }
}

/** Agent tokens are sent in the first encrypted frame, never URLs or browser cookies. */
export function connectAgent(ws: WsConnection) {
  let agentId = "";
  let permitted:
    { id: string; serials: string[]; tokenHash: string } | undefined;
  let authenticating = false;
  let token = "";
  let checking = false;
  const deadline = setTimeout(() => ws.close(4401), 5000);
  const timer = setInterval(() => {
    if (Date.now() - ws.lastReceivedAt > 12000) ws.close(1001);
    else ws.ping();
  }, 4000);
  const recheck = setInterval(() => {
    if (!permitted || checking) return;
    checking = true;
    void permission(token)
      .then((next) => {
        if (
          !next ||
          next.id !== agentId ||
          JSON.stringify(next.serials) !== JSON.stringify(permitted?.serials)
        )
          ws.close(4401);
      })
      .catch(() => ws.close(4401))
      .finally(() => {
        checking = false;
      });
  }, 30000);
  ws.on({
    onClose() {
      clearTimeout(deadline);
      clearInterval(timer);
      clearInterval(recheck);
      token = "";
      if (sockets.get(agentId) !== ws) return;
      sockets.delete(agentId);
      const agent = agents.get(agentId);
      if (agent) {
        agent.seen = 0;
        agent.commands = [];
      }
      for (const [id, item] of pending) {
        if (item.agentId !== agentId) continue;
        clearTimeout(item.timer);
        pending.delete(id);
        item.reject(new Error("슬레이브 연결이 끊겼어요"));
      }
    },
    onMessage(raw) {
      try {
        const data = JSON.parse(raw);
        if (!permitted) {
          if (
            authenticating ||
            typeof data.token !== "string" ||
            data.token.length > 512
          ) {
            ws.close(4401);
            return;
          }
          authenticating = true;
          token = data.token;
          void permission(token)
            .then((value) => {
              if (!ws.isOpen) return;
              if (!value || data.agentId !== value.id) {
                ws.close(4401);
                return;
              }
              permitted = value;
              agentId = value.id;
              const previous = sockets.get(agentId);
              // Finish old in-flight requests before accepting this new connection.
              previous?.close(1012);
              sockets.set(agentId, ws);
              updateDevices(data.devices);
              clearTimeout(deadline);
              ws.send(JSON.stringify({ ready: true }));
            })
            .catch(() => ws.close(4401));
          return;
        }
        if (data.devices) {
          updateDevices(data.devices);
          ws.send(JSON.stringify({ heartbeat: true }));
        }
        const agent = agents.get(agentId);
        if (agent) agent.seen = Date.now();
        if (data.responses !== undefined) {
          if (!Array.isArray(data.responses) || data.responses.length > 32)
            throw new Error();
          for (const result of data.responses) {
            const item = pending.get(result.id);
            if (!item || item.agentId !== agentId) continue;
            clearTimeout(item.timer);
            pending.delete(result.id);
            if (
              typeof result.result === "string" &&
              result.result.length <= 700000
            )
              item.resolve(Buffer.from(result.result, "base64"));
            else item.reject(new Error("슬레이브 조작을 완료하지 못했어요"));
          }
        }
      } catch {
        ws.close(1008);
      }
    },
  });
  function updateDevices(value: unknown) {
    if (!Array.isArray(value) || value.length > 20) throw new Error();
    const devices: DeviceInfo[] = value.map((d) => {
      if (
        !permitted?.serials.includes(d.serial) ||
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
          id !== agentId &&
          Date.now() - a.seen < 10000 &&
          a.devices.some((d) =>
            devices.some((next) => next.serial === d.serial),
          ),
      )
    )
      throw new Error();
    const current = agents.get(agentId);
    agents.set(agentId, {
      seen: Date.now(),
      devices,
      commands: current?.commands || [],
    });
    if (current?.commands.length)
      ws.send(JSON.stringify({ commands: current.commands.splice(0) }));
  }
}
async function permission(
  token: string,
): Promise<{ id: string; serials: string[]; tokenHash: string } | undefined> {
  const config = JSON.parse(
    await readFile(
      process.env.HEIMDALL_AGENTS_FILE || "/opt/aiqa/server/agents.local.json",
      "utf8",
    ),
  );
  const digest = createHash("sha256").update(token).digest();
  return config.agents.find(
    (a: { tokenHash: string }) =>
      /^[a-f0-9]{64}$/.test(a.tokenHash) &&
      timingSafeEqual(Buffer.from(a.tokenHash, "hex"), digest),
  );
}
