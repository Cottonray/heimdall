import type { Session, PublicSession } from "./types.ts";
export const sessions = new Map<string, Session>();
export function publicSession(s: Session): PublicSession {
  const { appiumId: _appiumId, epoch: _epoch, tail: _tail, ...result } = s;
  return result;
}
export function compact(s: PublicSession): PublicSession {
  return {
    ...s,
    steps: s.steps.map(({ observation: _observation, ...step }) => step),
  };
}
export function get(id: string) {
  const s = sessions.get(id);
  if (!s || s.state === "closed")
    throw new Error("실행 중인 세션이 아니에요. 재실행으로 새로 열어 주세요");
  return s;
}
