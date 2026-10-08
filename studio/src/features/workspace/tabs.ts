export const pages = [
  "projects",
  "devices",
  "dashboard",
  "history",
  "board",
  "domains",
  "settings",
  "project-settings",
] as const;
export type Page = (typeof pages)[number];
export function isPage(id: string): id is Page {
  return pages.some((page) => page === id);
}
export type TabState = { tabs: string[]; activeTab: string };
export function openTab(state: TabState, id: string): TabState {
  return {
    tabs: state.tabs.includes(id) ? state.tabs : [...state.tabs, id],
    activeTab: id,
  };
}
export function closeTab(state: TabState, id: string): TabState {
  if (id === "projects" || id === "dashboard" || !state.tabs.includes(id))
    return state;
  const index = state.tabs.indexOf(id);
  const tabs = state.tabs.filter((tab) => tab !== id);
  return {
    tabs,
    activeTab:
      state.activeTab === id ? tabs[Math.max(0, index - 1)]! : state.activeTab,
  };
}
