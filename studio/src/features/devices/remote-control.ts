export type RemoteControl =
  | { kind: "none" }
  | { kind: "human"; viewerId: string }
  | { kind: "runner"; label?: string };
export function mayControlDevice(
  ready: boolean,
  control: RemoteControl,
  viewerId: string,
) {
  return (
    ready &&
    (control.kind === "none" ||
      (control.kind === "human" && !!viewerId && control.viewerId === viewerId))
  );
}
export function mayRetryRemoteClose(code: number) {
  return ![4401, 4403, 4404, 4409].includes(code);
}
