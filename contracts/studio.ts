export type User = {
  id: string;
  username: string;
  name: string;
  role: "user" | "admin";
  avatar?: string | null;
  avatarUploadAllowed?: boolean;
  passwordChangeAllowed?: boolean;
};
export type Domain = { id: string; name: string; url: string; origin: string };
export type Engine = "web" | "mobile-web" | "api" | "android";
export type SessionState =
  "opening" | "manual" | "ai" | "replay" | "paused" | "passed" | "closed";
export type Action = {
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
  observation?: unknown;
};
export type Project = {
  id: string;
  name: string;
  created: string;
  tests: number;
};
export type Session = {
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
export type ToolArguments = NewSession & {
  id?: string;
  goal?: string;
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
  qa_action: Step;
  qa_export: SessionExport;
}
export type ToolName = keyof ToolResults;

export type DeviceInfo = {
  serial: string;
  state: string;
  kind: "emulator" | "real";
  model: string;
  selectable: boolean;
  current: boolean;
};
