import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { handleAgent, agentRequest, connectAgent } from "./agent-registry.ts";
test("long poll wakes immediately, independent results do not steal commands, credentials stay enforced", async () => {
  const dir = await mkdtemp(join(tmpdir(), "heimdall-agent-test-"));
  const prior = process.env.HEIMDALL_AGENTS_FILE;
  process.env.HEIMDALL_AGENTS_FILE = join(dir, "agents.json");
  const serial = "ios:11111111-1111-1111-1111-111111111111";
  await writeFile(
    process.env.HEIMDALL_AGENTS_FILE,
    JSON.stringify({
      agents: [
        {
          id: "test-agent",
          tokenHash: createHash("sha256").update("test-token").digest("hex"),
          serials: [serial],
        },
      ],
    }),
  );
  const server = createServer((req, res) => void handleAgent(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const exchange = async (extra: object, token = "test-token") => {
    const response = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        agentId: "test-agent",
        devices: [{ serial, platform: "ios", model: "Simulator", ready: true }],
        responses: [],
        ...extra,
      }),
    });
    return {
      status: response.status,
      body: (await response.json()) as {
        commands: { id: string; path: string }[];
      },
    };
  };
  try {
    assert.equal((await exchange({}, "wrong")).status, 403);
    await exchange({});
    const poll = exchange({ wait: true });
    await new Promise((r) => setTimeout(r, 30));
    const at = Date.now();
    const command = agentRequest(`/action?serial=${serial}`, {
      type: "key",
      key: "home",
    });
    const delivered = await poll;
    assert.ok(Date.now() - at < 1000);
    assert.equal(delivered.body.commands.length, 1);
    const next = agentRequest(`/frame?serial=${serial}`);
    const reply = await exchange({
      responseOnly: true,
      responses: [
        {
          id: delivered.body.commands[0].id,
          result: Buffer.from("{}").toString("base64"),
        },
      ],
    });
    assert.equal(reply.body.commands.length, 0);
    assert.equal((await command).toString(), "{}");
    const frames = await exchange({});
    assert.equal(frames.body.commands.length, 1);
    await exchange({
      responseOnly: true,
      responses: [
        {
          id: frames.body.commands[0].id,
          result: Buffer.from("jpeg").toString("base64"),
        },
      ],
    });
    assert.equal((await next).toString(), "jpeg");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    if (prior) process.env.HEIMDALL_AGENTS_FILE = prior;
    else delete process.env.HEIMDALL_AGENTS_FILE;
    await rm(dir, { recursive: true, force: true });
  }
});

test("agent WebSocket authenticates, dispatches immediately and rejects pending work on disconnect", async () => {
  const { accept } = await import("../../ws.ts");
  const dir = await mkdtemp(join(tmpdir(), "heimdall-ws-test-"));
  const prior = process.env.HEIMDALL_AGENTS_FILE;
  process.env.HEIMDALL_AGENTS_FILE = join(dir, "agents.json");
  const serial = "ios:22222222-2222-2222-2222-222222222222";
  await writeFile(
    process.env.HEIMDALL_AGENTS_FILE,
    JSON.stringify({
      agents: [
        {
          id: "ws-test",
          tokenHash: createHash("sha256").update("ws-token").digest("hex"),
          serials: [serial],
        },
      ],
    }),
  );
  const server = createServer();
  server.on("upgrade", (req, socket) => {
    const ws = accept(req, socket);
    if (ws) connectAgent(ws);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}`;
  const sockets: WebSocket[] = [];
  const open = async () => {
    const ws = new WebSocket(url);
    sockets.push(ws);
    await new Promise<void>((r, j) => {
      ws.addEventListener("open", () => r(), { once: true });
      ws.addEventListener("error", j, { once: true });
    });
    return ws;
  };
  const message = (ws: WebSocket) =>
    new Promise<{ ready?: boolean; heartbeat?: boolean; commands: { id: string; path: string }[] }>((r) =>
      ws.addEventListener("message", (e) => r(JSON.parse(String(e.data))), {
        once: true,
      }),
    );
  try {
    const bad = await open();
    const closed = new Promise<number>((r) =>
      bad.addEventListener("close", (e) => r(e.code), { once: true }),
    );
    bad.send(JSON.stringify({ agentId: "ws-test", token: "wrong" }));
    assert.equal(await closed, 4401);
    const ws = await open();
    const ready = message(ws);
    ws.send(
      JSON.stringify({
        agentId: "ws-test",
        token: "ws-token",
        devices: [{ serial, platform: "ios", model: "Simulator", ready: true }],
      }),
    );
    assert.equal((await ready).ready, true);
    const heartbeat = message(ws);
    ws.send(JSON.stringify({devices: [{serial, platform: "ios", model: "Simulator", ready: true}]}));
    assert.equal((await heartbeat).heartbeat, true);
    const delivered = message(ws);
    const result = agentRequest(`/action?serial=${serial}`, {
      type: "key",
      key: "home",
    });
    const { commands } = await delivered;
    assert.equal(commands.length, 1);
    ws.send(
      JSON.stringify({
        responses: [
          { id: commands[0].id, result: Buffer.from("ok").toString("base64") },
        ],
      }),
    );
    assert.equal((await result).toString(), "ok");
    const pending = agentRequest(`/frame?serial=${serial}`);
    const rejected = assert.rejects(pending, /연결이 끊겼/);
    ws.close();
    await rejected;
    await assert.rejects(
      agentRequest(`/frame?serial=${serial}`),
      /연결을 확인/,
    );
  } finally {
    for (const ws of sockets) ws.close();
    await new Promise<void>((r) => server.close(() => r()));
    if (prior) process.env.HEIMDALL_AGENTS_FILE = prior;
    else delete process.env.HEIMDALL_AGENTS_FILE;
    await rm(dir, { recursive: true, force: true });
  }
});
