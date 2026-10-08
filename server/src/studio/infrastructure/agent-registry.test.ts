import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { handleAgent, agentRequest } from "./agent-registry.ts";
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
