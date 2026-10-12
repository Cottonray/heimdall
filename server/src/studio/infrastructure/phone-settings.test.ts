import { test } from "node:test";
import assert from "node:assert/strict";
import { phoneSettingsInput } from "./phone-settings.ts";
test("Android reported phone numbers round trip into emulator digit-only format", () => {
  for (const phone of ["+01012345678", "01012345678"]) {
    assert.equal(phoneSettingsInput({ phone }).phone, "01012345678");
  }
  assert.equal(
    phoneSettingsInput({ phone: "+821012345678" }).phone,
    "821012345678",
  );
  assert.equal(phoneSettingsInput({ phone: "" }).phone, "");
  for (const phone of ["++01012345678", "+", "12", "010-1234-5678"])
    assert.throws(() => phoneSettingsInput({ phone }));
});
