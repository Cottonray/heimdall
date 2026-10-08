import type { Session as PublicSession } from "../../../../contracts/studio.ts";
export type {
  Action,
  Step,
  Observation,
  NewSession,
  Session as PublicSession,
  ToolArguments,
} from "../../../../contracts/studio.ts";
export type Session = PublicSession & {
  appiumId?: string;
  epoch: number;
  tail: Promise<unknown>;
};
