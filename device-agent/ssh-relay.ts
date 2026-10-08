import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer, connect, isIP } from "node:net";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
const exec = promisify(execFile);

/** Optional operator-configured, existing SSH trust; never exposes a public listener. */
export async function openSshRelay(host: string, signal: AbortSignal) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(host))
    throw new Error("SSH 호스트 별칭을 확인해 주세요");
  const options = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "ConnectTimeout=5",
  ];
  const { stdout } = await exec(
    "ssh",
    [
      ...options,
      host,
      "docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' aiqa",
    ],
    { timeout: 8000, signal },
  );
  const ip = stdout.trim().split(/\s+/)[0];
  if (!isIP(ip) || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip))
    throw new Error("마스터 컨테이너의 내부 주소를 확인해 주세요");
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const child: ChildProcess = spawn(
    "ssh",
    [
      ...options,
      "-N",
      "-T",
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=5",
      "-o",
      "ServerAliveCountMax=2",
      "-L",
      `127.0.0.1:${port}:${ip}:8080`,
      host,
    ],
    { stdio: "ignore" },
  );
  let failed = false;
  child.on("error", () => {
    failed = true;
  });
  child.on("exit", () => {
    failed = true;
  });
  const stop = () => child.kill();
  signal.addEventListener("abort", stop, { once: true });
  const close = () => {
    signal.removeEventListener("abort", stop);
    child.kill();
  };
  const deadline = Date.now() + 6000;
  try {
    while (!failed && !signal.aborted && Date.now() < deadline) {
      const ready = await new Promise<boolean>((resolve) => {
        const socket = connect(port, "127.0.0.1");
        socket.once("connect", () => {
          socket.destroy();
          resolve(true);
        });
        socket.once("error", () => {
          socket.destroy();
          resolve(false);
        });
        socket.setTimeout(300, () => {
          socket.destroy();
          resolve(false);
        });
      });
      if (ready)
        return {
          url: new URL(`ws://127.0.0.1:${port}/aiqa/studio/ws?agent=1`),
          close,
        };
      await delay(50, undefined, { signal });
    }
    throw new Error("SSH 중계를 확인해 주세요");
  } catch (error) {
    close();
    throw error;
  }
}
