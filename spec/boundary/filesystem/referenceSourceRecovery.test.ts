import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it } from "vitest";

import { normalizeHistoricalSourceParseFailures } from "../../../core/application/ReferenceSourceImport.js";
import { historicalSourceGraphSchema } from "../../../core/domain/referenceSourceGraph.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { importReferenceSource } from "../../support/referenceSourceResourceScope.js";

const sources = {
  "fatal.js": 'import "./valid";\nconst = ;',
  "ignored.py": 'import "./valid"; const missing;\n',
  "lazy.js": "export const lazy = true;\n",
  "recovered.d.cts": [
    "let duplicate: number;",
    "let duplicate: number;",
    'import dep = require("./valid");',
    'declare module "ambient-package" {}',
  ].join("\n"),
  "recovered.js": [
    "const missing;",
    "let duplicate;",
    "let duplicate;",
    "let duplicate;",
    'import "./valid";',
    'require("node:fs");',
    'import("./lazy");',
    "import(moduleName);",
  ].join("\n"),
  "recovered.ts": [
    "let duplicate: number;",
    "let duplicate: number;",
    'import dep = require("./valid");',
    'declare module "ambient-package" {}',
  ].join("\n"),
  "valid.js":
    'export { readFile } from "node:fs"; export * from "node:path";\n',
};
it("preserves recovered diagnostics and file evidence through filesystem import", async () => {
  const root = await createTestTempDirectory("rea-reference-recovery-");
  await mkdir(join(root, "core"));
  await Promise.all(
    Object.entries(sources).map(([path, source]) =>
      writeFile(join(root, "core", path), source),
    ),
  );

  const result = await importReferenceSource({
    root,
    caller: "reference-recovery-test",
    policy: { secretPatterns: [] },
  });
  if (!result.ok) throw result.error;
  const graph = result.value;
  expect(historicalSourceGraphSchema.safeParse(graph).success).toBe(true);
  expect(graph.entries.map(({ path }) => path)).toEqual([
    "src",
    ...Object.keys(sources).map((path) => `core/${path}`),
  ]);
  for (const [path, source] of Object.entries(sources)) {
    expect(graph.entries).toContainEqual(
      expect.objectContaining({
        path: `core/${path}`,
        kind: "file",
        size: Buffer.byteLength(source),
        sha256: createHash("sha256").update(source).digest("hex"),
        content_state: "hashed",
        limitations: [],
      }),
    );
  }

  const failures = [
    { path: "core/fatal.js", parser: "babel", reason: "Unexpected token (2:6)" },
    {
      path: "core/recovered.d.cts",
      parser: "babel",
      reason: "Identifier 'duplicate' has already been declared. (2:4)",
    },
    {
      path: "core/recovered.js",
      parser: "babel",
      reason: "Identifier 'duplicate' has already been declared. (3:4)",
    },
    {
      path: "core/recovered.js",
      parser: "babel",
      reason: "Identifier 'duplicate' has already been declared. (4:4)",
    },
    {
      path: "core/recovered.js",
      parser: "babel",
      reason: "Missing initializer in const declaration. (1:13)",
    },
    {
      path: "core/recovered.ts",
      parser: "babel",
      reason: "Identifier 'duplicate' has already been declared. (2:4)",
    },
  ];
  expect(graph.parse_failures).toEqual(failures);
  expect(
    normalizeHistoricalSourceParseFailures(
      [...graph.parse_failures].reverse().concat(graph.parse_failures),
    ),
  ).toEqual(failures);
  expect(graph.relationships).toEqual([
    {
      from_path: "core/recovered.d.cts",
      to: "ambient-package",
      kind: "declares-module",
      resolution: "unknown",
      parse_state: "partial",
    },
    {
      from_path: "core/recovered.d.cts",
      to: "core/valid.js",
      kind: "requires",
      resolution: "internal",
      parse_state: "partial",
    },
    {
      from_path: "core/recovered.js",
      to: "<dynamic-import>",
      kind: "imports",
      resolution: "unknown",
      parse_state: "partial",
    },
    {
      from_path: "core/recovered.js",
      to: "core/lazy.js",
      kind: "imports",
      resolution: "internal",
      parse_state: "partial",
    },
    {
      from_path: "core/recovered.js",
      to: "core/valid.js",
      kind: "imports",
      resolution: "internal",
      parse_state: "partial",
    },
    {
      from_path: "core/recovered.ts",
      to: "ambient-package",
      kind: "declares-module",
      resolution: "unknown",
      parse_state: "partial",
    },
    {
      from_path: "core/recovered.ts",
      to: "core/valid.js",
      kind: "requires",
      resolution: "internal",
      parse_state: "partial",
    },
    {
      from_path: "core/valid.js",
      to: "node:fs",
      kind: "imports",
      resolution: "external",
      parse_state: "parsed",
    },
    {
      from_path: "core/valid.js",
      to: "node:path",
      kind: "imports",
      resolution: "external",
      parse_state: "parsed",
    },
  ]);
  // The reader's pathname-race advisory already makes inventory partial.
  expect(graph.inventory_state).toBe("partial");
});
