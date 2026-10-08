import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { hashPassword, verifyPassword, sessionHash, localRequest } from "./auth.ts";
import { normalizeDomain } from "./domains.ts";
import { configureOrigins, checkUrl } from "../../../../browser-worker/src/policy.ts";
test("passwords use independent salts and reject wrong passwords", async () => {
  const first = await hashPassword("test-secret-123456789");
  const second = await hashPassword("test-secret-123456789");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("test-secret-123456789", first), true);
  assert.equal(await verifyPassword("wrong", first), false);
  assert.equal(await verifyPassword("wrong", "invalid"), false);
});
test("session tokens are hashed and proxy headers cannot claim loopback", () => {
  const req = { headers: {cookie: "heimdall_session=" + "a".repeat(43), "x-forwarded-for": "127.0.0.1"}, socket: {remoteAddress:"172.18.0.2"} } as unknown as IncomingMessage;
  assert.match(sessionHash(req), /^[a-f0-9]{64}$/);
  assert.equal(localRequest(req), false);
  req.headers.cookie = "heimdall_session=invalid";
  assert.equal(sessionHash(req), "");
});
test("domain registration normalizes origins and rejects embedded credentials", () => {
  assert.deepEqual(normalizeDomain("https://EXAMPLE.com/start?mode=test"), {url:"https://example.com/start?mode=test",origin:"https://example.com"});
  for (const value of ["javascript:alert(1)", "file:///etc/passwd", "https://admin:password@example.com", "https://example.com/#fragment", "not a url"]) assert.throws(() => normalizeDomain(value));
});
test("worker applies domain removal and rejects invalid configuration atomically", () => {
  configureOrigins(["https://example.com"]);
  assert.equal(checkUrl("https://example.com/test"), "https://example.com/test");
  assert.throws(() => checkUrl("https://unregistered.example"));
  assert.throws(() => configureOrigins(["https://example.com", "file:///"]));
  assert.equal(checkUrl("https://example.com"), "https://example.com/");
  configureOrigins([]);
  assert.throws(() => checkUrl("https://example.com/test"));
});
