import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(root, "../web/studio");
await mkdir(out + "/assets", { recursive: true });
await build({
  entryPoints: [root + "/src/main.tsx"],
  bundle: true,
  loader: { ".png": "dataurl" },
  minify: true,
  format: "esm",
  target: "es2022",
  outfile: out + "/assets/app.js",
  tsconfig: root + "/tsconfig.json",
  define: { "process.env.NODE_ENV": '"production"' },
});
execFileSync(
  process.execPath,
  [
    root + "/node_modules/@tailwindcss/cli/dist/index.mjs",
    "-i",
    root + "/src/styles.css",
    "-o",
    out + "/assets/app.css",
    "--minify",
  ],
  { cwd: root, stdio: "inherit" },
);
const hash = createHash("sha256")
  .update(await readFile(out + "/assets/app.js"))
  .update(await readFile(out + "/assets/app.css"))
  .digest("hex")
  .slice(0, 12);
const html = (await readFile(root + "/index.html", "utf8"))
  .replaceAll("assets/app.js", "assets/app.js?v=" + hash)
  .replaceAll("assets/app.css", "assets/app.css?v=" + hash);
await writeFile(out + "/index.html", html);
console.log("Studio build " + hash);
