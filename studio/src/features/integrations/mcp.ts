import { download } from "@/lib/api";
export function downloadMcp() {
  download(
    JSON.stringify(
      {
        mcpServers: {
          "ai-qa": {
            command: "ssh",
            args: [
              "-T",
              "heimdall-host",
              "docker",
              "exec",
              "-i",
              "aiqa",
              "node",
              "--experimental-strip-types",
              "/opt/aiqa/server/src/studio-mcp.ts",
            ],
          },
        },
      },
      null,
      2,
    ),
    "mcp-ai-qa.json",
  );
}
