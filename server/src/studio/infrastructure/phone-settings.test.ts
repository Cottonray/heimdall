import { test } from "node:test";
import assert from "node:assert/strict";
import { phoneSettingsInput, readPhoneSettings } from "./phone-settings.ts";
test("accepts phone settings and rejects shell input and invalid states", () => {
  assert.equal(
    phoneSettingsInput({ phone: "+821012345678", carrier: "SKT" }).phone,
    "+821012345678",
  );
  for (const data of [
    { phone: "1;id" },
    { carrier: "SKT;id" },
    { voice: "unknown" },
    { network: "$(id)" },
  ])
    assert.throws(() => phoneSettingsInput(data));
});
test("iOS and physical devices are not advertised as writable SIMs", async () => {
  assert.equal((await readPhoneSettings("ios:simulator")).supported, false);
  assert.equal((await readPhoneSettings("physical-device")).supported, false);
});
