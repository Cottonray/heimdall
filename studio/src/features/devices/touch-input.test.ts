import test from "node:test";
import assert from "node:assert/strict";
import { createTouchInput, type TouchInput } from "./touch-input.ts";

test("down arrives before release; move backlog coalesces and final up is preserved", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sent: { id: string; action: TouchInput }[] = [];
  const input = createTouchInput(
    (id, action) => sent.push({ id, action }),
    assert.fail,
  );
  input.push({ type: "touch", phase: "down", x: 1, y: 1 });
  assert.equal(sent[0].action.phase, "down");
  for (let i = 2; i < 50; i++) {
    input.push({ type: "touch", phase: "move", x: i, y: i });
    t.mock.timers.tick(16);
  }
  assert.equal(sent.length, 3);
  input.push({ type: "touch", phase: "up", x: 50, y: 50 });
  input.reply(sent[0].id, true);
  assert.equal(sent[3].action.x, 49);
  input.reply(sent[1].id, true);
  assert.equal(sent[4].action.phase, "up");
  input.stop();
});
test("failed or missing acknowledgements stop input and trigger connection cleanup", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let failures = 0;
  const input = createTouchInput(
    () => {},
    () => failures++,
  );
  input.push({ type: "touch", phase: "down", x: 1, y: 1 });
  t.mock.timers.tick(5000);
  assert.equal(failures, 1);
  assert.equal(input.push({ type: "touch", phase: "move", x: 2, y: 2 }), false);
});
