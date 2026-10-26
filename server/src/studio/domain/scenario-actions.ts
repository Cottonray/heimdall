import type { Action } from "../../../../contracts/studio.ts";

// An execution snapshot retains unexecuted steps after failure or interruption.
export function scenarioActions(source: { execution?: { actions?: Action[] }; steps: { action: Action }[] }): Action[] {
  return source.execution?.actions ?? source.steps.map(step => step.action);
}
