import { execFileSync } from "node:child_process";
import { mkdir, copyFile, chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
await mkdir(resolve(root, "dist"), { recursive: true });
execFileSync(
  process.execPath,
  [
    resolve(root, "../studio/node_modules/esbuild/bin/esbuild"),
    resolve(root, "cli.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${resolve(root, "dist/heimdall.js")}`,
  ],
  { stdio: "inherit" },
);
const dir = await mkdtemp(resolve(tmpdir(), "heimdall-package-"));
try {
  await copyFile(resolve(root, "dist/heimdall.js"), resolve(dir, "heimdall"));
  await chmod(resolve(dir, "heimdall"), 0o755);
  await copyFile(resolve(root, "README.md"), resolve(dir, "README.md"));
  const output = resolve(root, "../web/studio/assets/heimdall-macos.zip");
  await rm(output, { force: true });
  execFileSync("zip", ["-q", output, "heimdall", "README.md"], { cwd: dir });
} finally {
  await rm(dir, { recursive: true, force: true });
}
