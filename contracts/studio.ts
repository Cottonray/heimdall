export type User = {
  id: string;
  username: string;
  name: string;
  role: "user" | "admin";
  avatar?: string | null;
  avatarUploadAllowed?: boolean;
  passwordChangeAllowed?: boolean;
};
export type Domain = {
  id: string;
  name: string;
  url: string;
  origin: string;
  environment?: "web" | "app" | "api";
};
export type Engine = "web" | "mobile-web" | "api" | "android";
export type SessionState =
  "opening" | "manual" | "ai" | "replay" | "paused" | "passed" | "closed";
export type Action = {
  comment?: string;
  type: string;
  text?: string;
  selector?: string;
  value?: string;
  x?: number;
  y?: number;
  key?: string;
  direction?: string;
  url?: string;
  status?: number;
  contains?: string;
};
export type UiNode = {
  text?: string;
  selector?: string;
  desc?: string;
  bounds?: { left: number; top: number; right: number; bottom: number };
};
export type DebugLog = {
  at: string;
  type: string;
  level?: string;
  text?: string;
  status?: number;
  url?: string;
};
export type Observation = {
  url?: string;
  title?: string;
  tree?: string | UiNode[];
  elements?: {
    text?: string | null;
    selector?: string;
    placeholder?: string | null;
    label?: string | null;
  }[];
  logs?: DebugLog[];
  width?: number;
  height?: number;
  serial?: string;
};
export type Step = {
  n: number;
  at: string;
  actor: string;
  action: Action;
  ok: boolean;
  ms: number;
  error?: string;
  evidence?: string;
  targetEvidence?: string;
  targetCaptureError?: string;
  target?: { x: number; y: number; width: number; height: number; screenWidth: number; screenHeight: number };
  observation?: unknown;
};
export type ProjectRepository = {
  sourceType: "git" | "svn";
  sourceUrl: string;
  description: string;
};
export type Project = {
  demoScenarioIds?: string[];
  appPackage?: string;
  repositories?: ProjectRepository[];
  sourceType?: "git" | "svn";
  sourceUrl?: string;
  description?: string;
  id: string;
  name: string;
  created: string;
  tests: number;
};
export type TestDataEntry = {
  id: string;
  name: string;
  content: string;
  customerNumber: string;
  tags: string;
  updated: number;
};
export type DataBinding = {
  step: number;
  field: "url" | "value" | "text" | "contains" | "status";
  path: string;
};
export type RunOptions = {
  testDataId?: string;
  testDataUpdated?: number;
  sourceUpdated?: number;
  bindings?: DataBinding[];
};
export type Execution = {
  actions?: Action[];
  sourceId: string;
  sourceName: string;
  testDataId?: string;
  testDataName?: string;
  testDataUpdated?: number;
  bindings: DataBinding[];
  total: number;
  status: "running" | "passed" | "completed" | "failed" | "interrupted";
  started: number;
  finished?: number;
};
export type ScenarioPlan = {
  status: "draft";
  appPackage: string;
  summary: string;
  prerequisites: string[];
  data: { name: string; description: string }[];
  steps: { title: string; action: string; expected: string; source: string }[];
  branches: { title: string; expected: string; source: string }[];
};
export type ChatCheck = { details?: string[]; label: string; status: "pending" | "running" | "done" | "blocked" | "skipped" };
export type Session = {
  scenarioActions?: Action[];
  verificationPending?: boolean;
  chat?: { role: "user" | "assistant"; text: string; at: number; checklist?: ChatCheck[] }[];
  appPackage?: string;
  plan?: ScenarioPlan;
  execution?: Execution;
  projectId?: string;
  id: string;
  name: string;
  engine: Engine;
  url: string;
  state: SessionState;
  message: string;
  created: string;
  updated: number;
  steps: Step[];
  goal?: string;
  observation?: Observation;
  working: boolean;
  ai: boolean;
  parent?: string;
};
export type NewSession = {
  appPackage?: string;
  projectId?: string;
  engine?: Engine;
  name?: string;
  url?: string;
  parent?: string;
};
export type SessionExport = { session: Session; code: string; jsonl: string };
export type StudioStatus = {
  domains: Domain[];
  projects: Project[];
  browser: { ok: boolean; active?: number; capacity?: number };
  android: { booted: boolean };
  llm: boolean;
  sessions: Session[];
};
export type ToolArguments = NewSession &
  RunOptions & {
    id?: string;
    goal?: string;
    passiveObservation?: boolean;
    action?: Action;
  };
export interface ToolResults {
  qa_list: Session[];
  qa_open: Session;
  qa_observe: Session;
  qa_pause: Session;
  qa_close: Session;
  qa_agent: Session;
  qa_replay: Session;
  qa_run: Session;
  qa_action: Step;
  qa_export: SessionExport;
}
export type ToolName = keyof ToolResults;

export type DeviceInfo = {
  ownedByMe?: boolean;
  usage?: "available" | "in-use";
  serial: string;
  state: string;
  kind: "emulator" | "real";
  model: string;
  selectable: boolean;
  current: boolean;
  platform: "android" | "ios";
  ready: boolean;
  error?: string;
};
export type WebViewTarget = {
  socket: string;
  id: string;
  title: string;
  url: string;
  kind: "webview" | "browser";
};
export type WebViewDiscovery = {
  targets: WebViewTarget[];
  unavailable: number;
};

export type StudioNotification = {
  id: string;
  sessionId: string;
  title: string;
  message: string;
  at: string;
  read: boolean;
};
