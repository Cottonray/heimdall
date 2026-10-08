export const tools = [
  {
    name: "qa_list",
    description: "List QA sessions and saved scenarios",
    props: {},
  },
  {
    name: "qa_open",
    description:
      "Open an isolated web, mobile-web, api or android test session",
    props: {
      engine: { type: "string", enum: ["web", "mobile-web", "api", "android"] },
      name: { type: "string" },
      url: { type: "string" },
    },
  },
  ...["observe", "pause", "export", "replay", "close"].map((x) => ({
    name: `qa_${x}`,
    description: `${x} an AI QA session`,
    props: { id: { type: "string" } },
  })),
  {
    name: "qa_action",
    description: "Perform and record a typed QA action; no arbitrary code",
    props: {
      id: { type: "string" },
      action: {
        type: "object",
        properties: {
          type: { type: "string" },
          text: { type: "string" },
          selector: { type: "string" },
          value: { type: "string" },
          url: { type: "string" },
          status: { type: "number" },
          contains: { type: "string" },
          key: { type: "string" },
          direction: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
        },
      },
    },
  },
  {
    name: "qa_agent",
    description:
      "Let AI operate toward a goal while preserving human actions; async, poll observe",
    props: { id: { type: "string" }, goal: { type: "string" } },
  },
];
