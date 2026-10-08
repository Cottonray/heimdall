import { useEffect, useState, useSyncExternalStore } from "react";
import { WorkspaceStore } from "./store";
export function useWorkspace() {
  const [store] = useState(() => new WorkspaceStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => store.start(), [store]);
  return {
    store,
    ...state,
    session: state.sessions.find((s) => s.id === state.selectedId),
  };
}
