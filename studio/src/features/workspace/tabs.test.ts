import test from "node:test";
import assert from "node:assert/strict";
import { openTab, closeTab } from "./tabs.ts";
test("opening an existing tab preserves order and avoids duplicates", () => {
  const state = {
    tabs: ["dashboard", "test-a", "history"],
    activeTab: "history",
  };
  assert.deepEqual(openTab(state, "test-a"), {
    tabs: state.tabs,
    activeTab: "test-a",
  });
  assert.equal(state.activeTab, "history");
});
test("closing an active test selects the preceding tab without dropping others", () => {
  assert.deepEqual(
    closeTab(
      { tabs: ["dashboard", "test-a", "test-b"], activeTab: "test-b" },
      "test-b",
    ),
    { tabs: ["dashboard", "test-a"], activeTab: "test-a" },
  );
});
test("dashboard stays pinned and background tab close preserves active tab", () => {
  const state = {
    tabs: ["dashboard", "history", "test-a"],
    activeTab: "test-a",
  };
  assert.deepEqual(closeTab(state, "dashboard"), state);
  assert.deepEqual(closeTab(state, "missing"), state);
  assert.deepEqual(closeTab(state, "history"), {
    tabs: ["dashboard", "test-a"],
    activeTab: "test-a",
  });
});
