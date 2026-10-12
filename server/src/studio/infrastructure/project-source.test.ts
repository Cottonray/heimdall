import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSource, readProjectSource } from "./project-source.ts";
test("source references reject credentials, alternate protocols and unconfigured hosts", () => {
  for (const sourceUrl of [
    "file:///etc/passwd",
    "https://user:secret@github.com/org/repo",
    "https://localhost/repo",
    "ssh://github.com/org/repo",
    "https://github.com/org/repo?token=secret",
  ]) {
    assert.throws(() => normalizeSource({ sourceUrl }));
  }
  assert.equal(
    normalizeSource({ sourceUrl: "https://github.com/org/repo.git" })
      .sourceType,
    "git",
  );
  assert.equal(
    normalizeSource({
      sourceType: "svn",
      sourceUrl: "https://svn.apache.org/repos/asf",
    }).sourceType,
    "svn",
  );
});
test("description-only projects do not require repository access", async () => {
  assert.deepEqual(await readProjectSource({ description: " Login flow " }), {
    description: "Login flow",
    files: [],
    truncated: false,
  });
});
