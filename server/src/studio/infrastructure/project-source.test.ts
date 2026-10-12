import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSource,
  readProjectSource,
  normalizeProjectSources,
  readProjectSources,
} from "./project-source.ts";
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

test("multiple repositories preserve independent descriptions and legacy settings", () => {
  const repositories = [
    {
      sourceType: "git" as const,
      sourceUrl: "https://github.com/org/web",
      description: " Web screens ",
    },
    {
      sourceType: "svn" as const,
      sourceUrl: "https://svn.apache.org/repos/asf",
      description: " API flows ",
    },
  ];
  const result = normalizeProjectSources({
    description: " Project ",
    repositories,
  });
  assert.equal(result.description, "Project");
  assert.deepEqual(
    result.repositories.map((r) => r.description),
    ["Web screens", "API flows"],
  );
  assert.equal(
    normalizeProjectSources(repositories[0]).repositories[0].sourceUrl,
    repositories[0].sourceUrl,
  );
  assert.deepEqual(
    normalizeProjectSources({ ...repositories[0], repositories: [] })
      .repositories,
    [],
  );
  assert.throws(() =>
    normalizeProjectSources({
      repositories: [repositories[0], repositories[0]],
    }),
  );
  assert.throws(() =>
    normalizeProjectSources({ repositories: Array(6).fill(repositories[0]) }),
  );
  assert.throws(() =>
    normalizeProjectSources({ repositories: [{ sourceUrl: "" }] }),
  );
});
test("projects without repositories retain AI context without fetching sources", async () => {
  assert.deepEqual(
    await readProjectSources({
      description: " Business rules ",
      repositories: [],
    }),
    {
      description: "Business rules",
      repositories: [],
    },
  );
});
