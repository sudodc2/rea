import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { parseProductionReachabilityReport } from "../../../tooling/ci/production-reachability-report.mjs";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const script = fileURLToPath(
  new URL(
    "../../../tooling/ci/production-reachability-report.mjs",
    import.meta.url,
  ),
);
const configuration = new URL("../../../knip.production.json", import.meta.url);
const reportPath = (root: string) =>
  join(root, ".cache/static-checks/production-reachability.json");
const invoke = (root: string) =>
  spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    timeout: 15_000,
  });

it("reports test-only candidates without losing dynamic, worker or published roots", async () => {
  const root = await createTestTempDirectory("rea-production-reachability-");
  const files = {
    "package.json": JSON.stringify({
      name: "reachability-fixture",
      type: "module",
      bin: { fixture: "tooling/rea.mjs" },
      exports: { "./published": "./core/published.ts" },
    }),
    "core/main.ts":
      'import { live } from "./facts.js"; console.log(live); void import("./lazy.js");',
    "core/facts.ts": "export const live = 1; export const testOnly = 2;",
    "core/lazy.ts": "console.log('dynamic production module');",
    "core/testOnly.ts": "export const retired = 3;",
    "core/published.ts": "export const publicContract = 4;",
    "core/composition/javascriptAnalysisWorkerProcess.ts":
      'import { workerFact } from "../workerFacts.js"; console.log(workerFact);',
    "core/workerFacts.ts": "export const workerFact = 5;",
    "tooling/rea.mjs": 'import "../core/main.js";',
    "spec/facts.test.ts":
      'import { testOnly } from "../core/facts.js"; import { retired } from "../core/testOnly.js"; console.log(testOnly, retired);',
  };
  for (const [path, content] of Object.entries(files)) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  await writeFile(
    join(root, "knip.production.json"),
    await readFile(configuration, "utf8"),
  );

  const result = invoke(root);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("advisory candidates");
  const { issues } = parseProductionReachabilityReport(
    await readFile(reportPath(root), "utf8"),
  );
  expect(issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        file: "core/facts.ts",
        exports: expect.arrayContaining([
          expect.objectContaining({ name: "testOnly" }),
        ]),
      }),
      expect.objectContaining({ file: "core/testOnly.ts" }),
    ]),
  );
  const reached = [
    "core/main.ts",
    "core/lazy.ts",
    "core/published.ts",
    "core/workerFacts.ts",
    "core/composition/javascriptAnalysisWorkerProcess.ts",
    "spec/facts.test.ts",
  ];
  expect(issues.filter(({ file }) => reached.includes(file))).toEqual([]);
  expect(
    issues.flatMap(({ exports: findings = [] }) =>
      findings.map(({ name }) => name),
    ),
  ).not.toContain("live");
});

it("fails on Knip configuration errors and removes a stale candidate report", async () => {
  const root = await createTestTempDirectory(
    "rea-production-reachability-error-",
  );
  await writeFile(join(root, "package.json"), '{"name":"broken-config"}');
  await writeFile(join(root, "knip.production.json"), "{");
  await mkdir(dirname(reportPath(root)), { recursive: true });
  await writeFile(reportPath(root), '{"issues":[]}');

  const result = invoke(root);
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Production reachability analysis failed");
  await expect(access(reportPath(root))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it.each([
  "not JSON",
  '{"issues":[{"file":"core/facts.ts","exports":[{"name":42}]}]}',
  '{"issues":[{"file":"core/facts.ts","unrecognized":[]}]}',
])("rejects malformed checker output: %s", (text) => {
  expect(() => parseProductionReachabilityReport(text)).toThrow();
});
