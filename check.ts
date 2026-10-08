import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const yarn = path.resolve(
  root,
  "tools/yarn-4.18.0.cjs",
);
for (const project of ["server", "browser-worker", "studio"]) {
  execFileSync(process.execPath, [yarn, "install", "--immutable"], {
    cwd: path.join(root, project),
    stdio: "inherit",
  });
}
execFileSync(process.execPath, [yarn, "check"], {
  cwd: path.join(root, "studio"),
  stdio: "inherit",
});
execFileSync(
  process.execPath,
  ["--experimental-strip-types", "--test", "server/src/studio.test.ts"],
  { cwd: root, stdio: "inherit" },
);
