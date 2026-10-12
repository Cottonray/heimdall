// Isolated terminal container entrypoint. Never run this in the master container.
import { createServer } from "node:http";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import * as pty from "node-pty";
import { accept } from "../ws.ts";
const secret = (
  await readFile(
    process.env.AIQA_TERMINAL_KEY_FILE || "/run/terminal-key",
    "utf8",
  )
).trim();
if (secret.length < 32) throw new Error("Terminal key missing");
const server = createServer((_req, res) => res.writeHead(404).end());
let active = 0;
server.on("upgrade", (req, socket) => {
  const url = new URL(req.url || "/", "http://localhost");
  const supplied = Buffer.from(url.searchParams.get("token") || "");
  const expected = Buffer.from(secret);
  if (
    url.pathname !== "/terminal" ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected) ||
    active >= 4
  ) {
    socket.destroy();
    return;
  }
  const ws = accept(req, socket);
  if (!ws) return;
  active++;
  let terminal: pty.IPty | undefined;
  let folder = "";
  let closed = false;
  let started = false;
  let size = { cols: 100, rows: 24 };
  const stop = () => {
    if (closed) return;
    closed = true;
    active--;
    clearTimeout(timeout);
    clearInterval(heartbeat);
    terminal?.kill();
    if (folder) void rm(folder, { recursive: true, force: true });
  };
  const timeout = setTimeout(() => ws.close(1000), 30 * 60 * 1000);
  const heartbeat = setInterval(() => {
    if (Date.now() - ws.lastReceivedAt > 15000) ws.close(1001);
    else ws.ping();
  }, 5000);
  ws.on({
    onClose: stop,
    onMessage: (raw) => {
      void (async () => {
        const message = JSON.parse(raw);
        if (message.type === "start" && !started) {
          started = true;
          if (
            typeof message.config !== "string" ||
            message.config.length > 100000 ||
            typeof message.token !== "string"
          )
            throw new Error("Invalid setup");
          folder = await mkdtemp("/tmp/codex-terminal-");
          await writeFile(folder + "/config.toml", message.config + `\n[projects.${JSON.stringify(folder)}]\ntrust_level = "trusted"\n`, {
            mode: 0o600,
          });
          if (closed) {
            await rm(folder, { recursive: true, force: true });
            return;
          }
          terminal = pty.spawn(
            "/opt/aiqa/server/codex/bin/codex",
            [
              "--dangerously-bypass-approvals-and-sandbox",
              "--no-alt-screen",
              "-C",
              folder,
            ],
            {
              name: "xterm-256color",
              cols: size.cols,
              rows: size.rows,
              cwd: folder,
              env: {
                PATH: "/usr/local/bin:/usr/bin:/bin",
                HOME: folder,
                CODEX_HOME: folder,
                TERM: "xterm-256color",
                LANG: "C.UTF-8",
                HEIMDALL_GATEWAY_TOKEN: message.token,
              },
            },
          );
          terminal.onData((data) => {
            if (ws.socket.writableLength > 1024 * 1024) ws.close(1009);
            else ws.send(JSON.stringify({ type: "output", data }));
          });
          terminal.onExit(() => ws.close(1000));
          ws.send(JSON.stringify({type:"ready"}));
        } else if (
          message.type === "input" &&
          typeof message.data === "string" &&
          message.data.length <= 8192
        )
          terminal?.write(message.data);
        else if (
          message.type === "resize" &&
          Number.isInteger(message.cols) &&
          Number.isInteger(message.rows)
        ) {
          size = {cols:Math.max(20,Math.min(300,message.cols)),rows:Math.max(5,Math.min(120,message.rows))};
          terminal?.resize(size.cols,size.rows);
        }
      })().catch(() => {
        ws.send(
          JSON.stringify({
            type: "error",
            error: "터미널을 시작하지 못했어요.",
          }),
        );
        ws.close(1011);
      });
    },
  });
});
server.listen(8090, "0.0.0.0");
