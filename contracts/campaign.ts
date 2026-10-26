export type CampaignCase = {
  id: string;
  title: string;
  category: string;
  goal: string;
  expected: string;
  status: "queued" | "running" | "passed" | "attention";
  sessionId?: string;
  steps: number;
  assertions: number;
  humanActions: number;
  evidence?: string;
  message?: string;
  trace?: string[];
  review?: string;
};
export type Campaign = {
  id: string;
  projectId: string;
  engine: "android" | "mobile-web";
  url?: string;
  status:
    "discovering" | "ready" | "running" | "completed" | "stopped" | "error";
  created: number;
  updated: number;
  sourceFiles: number;
  cases: CampaignCase[];
  message: string;
};
