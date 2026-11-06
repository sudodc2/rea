#!/usr/bin/env node
/**
 * rea-lua fixture runner — analyzes every file in spec/fixtures and writes
 * JSON reports to verification/lua/. Exits non-zero if any fixture crashes the
 * analyzer or produces an unexpected primary format.
 *
 *   node lua/tests/run.mjs
 */
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBuffer } from "../rea-lua.mjs";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const fixtures = join(here, "fixtures");
const outDir = join(repo, "verification", "lua");
mkdirSync(outDir, { recursive: true });

const EXPECTED = {
  "plain.lua": "luau-plain",
  "luraph-marker.lua": "luraph",
  "webhook.lua": "luau-plain",
  "malformed.lua": "luau-bytecode",
  "garbage.bin": "unknown",
};

let failures = 0;
for (const name of readdirSync(fixtures).sort()) {
  const buf = readFileSync(join(fixtures, name));
  let report;
  try {
    report = analyzeBuffer(buf, name);
  } catch (e) {
    console.error(`FAIL ${name}: analyzer threw: ${e.message}`);
    failures++;
    continue;
  }
  writeFileSync(
    join(outDir, `${name}.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  const want = EXPECTED[name];
  const got = report.primary_format;
  const ok = want === undefined || got === want;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}: ${got}${want ? ` (expected ${want})` : ""}` +
      ` | net=${Object.keys(report.network_surface).length} env=${report.env_probes.length}`,
  );
}
process.exit(failures ? 1 : 0);
