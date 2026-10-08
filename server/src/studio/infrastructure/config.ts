import path from "node:path";
export const WORKER =
  process.env.AIQA_BROWSER_WORKER_URL || "http://aiqa-browser:8081";
export const DIR = path.join(
  process.env.AIQA_RUNS_DIR || "/opt/aiqa/runs",
  "studio",
);
