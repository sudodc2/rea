import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Architecture guards for the strict-identity / best-effort-inference split.
// - Evidence ordering must be locale-independent (ICU varies by host), so
//   core/domain orders with compareUnicodeCodePoints, never localeCompare.
// - Composite dedup keys must not NUL-join variable-length or free-form
//   MIDDLE fields: ["a\0b"] collapses with ["a", "b"] and drops a finding.
//   compositeKey (JSON tuple) is the single owner for composite keys.
// - Transparent wrappers unwrap in exactly one place
//   (javascriptAstValues.unwrapJavaScriptExpression); direct isTS* unwrapping
//   elsewhere drifts (the `satisfies` class of bug).
// - AST walks go through traverseJavaScriptAst/childNodes: bespoke
//   Object.values walkers diverge on loc/comment fields and overflow the
//   stack on deep generated chains.

const root = fileURLToPath(new URL("../../", import.meta.url));

const listFiles = async (dir) => {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(path)));
    else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".fixture.ts")
    )
      output.push(path);
  }
  return output;
};

const stripComments = (content) =>
  content
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//gu, "");

const sources = await listFiles(join(root, "core"));
const files = await Promise.all(
  sources.map(async (path) => ({
    path: relative(root, path).split(sep).join("/"),
    content: stripComments(await readFile(path, "utf8")),
  })),
);
const inDir = (dir) => files.filter((file) => file.path.startsWith(dir));

const failures = [];
const check = (label, selected, pattern, allow = []) => {
  const offenders = selected.filter(
    (file) => pattern.test(file.content) && !allow.includes(file.path),
  );
  if (offenders.length > 0)
    failures.push(
      `${label}:\n${offenders.map((file) => `  ${file.path}`).join("\n")}`,
    );
};

// Prerequisite inspection lifetime is an application contract shared by adapters.
check(
  "provider-owned inspection lifetime (use core/application/ProviderInspectionScope)",
  files,
  /providers\/ProviderInspectionScope\.js/,
);

check(
  "core/domain uses localeCompare (use compareUnicodeCodePoints)",
  inDir("core/domain/"),
  /\.localeCompare\(/,
);

check(
  "NUL-joined list key (use compositeKey)",
  files,
  /\.join\(["']\\0["']\)/,
  [
    // Sorted pair of constrained trace IDs; documented in plan.
    "core/domain/process/processTraceSpecification.ts",
  ],
);

check(
  "direct transparent-wrapper unwrap outside javascriptAstValues (use unwrapJavaScriptExpression)",
  files,
  /isTSAsExpression|isTSSatisfiesExpression|isTSNonNullExpression|isTSTypeAssertion|isTSInstantiationExpression|isParenthesizedExpression/,
  ["core/domain/javascript/javascriptAstValues.ts"],
);

check(
  "bespoke AST child walker (use traverseJavaScriptAst/childNodes)",
  files,
  /VISITOR_KEYS/,
  ["core/domain/javascript/javascriptSemanticTraversal.ts"],
);

// A producer that pins both the soft and hard ceiling of every resource takes
// the vector from one owner. prlimitCeilingArguments is the command-less prefix
// of prlimitArgumentVector; both live in core/process/LinuxResourceLimits.ts.
// Re-audited 2026-10-22 with util-linux 2.39.3: a bare value sets both soft and
// hard, the same as soft:hard when the numbers are equal. `soft:` leaves the
// inherited hard ceiling unchanged.
// FirmwareCommand and WakaruCommand call prlimitArgumentVector and keep their
// own file-size and CPU budgets (120 CPU seconds; firmware file size is the
// call output budget or the 8 MiB report allowance; Wakaru file size is the
// 128 MiB output allowance). Their 1 GiB address space is
// BOUNDED_PRODUCER_LIMITS.address_space_bytes. PcapNativeBound calls
// prlimitCeilingArguments because PcapCommand appends the producer command.
// Its CPU ceiling stays 300 seconds and it has no resident-input budget;
// address space and file size use those shared fields.
// selectEvmWorkerLimits stays a separate selector: Result failures, unit
// checks, and a refusal when soft exceeds hard. It must not call
// clampLinuxResourceLimits.
check(
  "inline paired prlimit ceilings (use prlimitArgumentVector from core/process/LinuxResourceLimits)",
  files,
  /--core=0:0/,
  ["core/process/LinuxResourceLimits.ts"],
);

check(
  "bare prlimit value (a bare value sets both ceilings; use prlimitArgumentVector)",
  files,
  /--core=0(?!:)/,
);

// 2026-10-22: soft-only `resource:` options retain the inherited hard ceiling.
// EVMole budgets differ (3 GiB address space, 16 MiB file, 30 CPU seconds), so
// this lane must not call prlimitArgumentVector.
check(
  "soft-only prlimit ceilings (paired producers use prlimitArgumentVector)",
  files,
  /--core=0:(?!0)/,
  ["core/evm/EvmoleInterfaceProvider.ts"],
);

// Resident input is the input_bytes field of BOUNDED_PRODUCER_LIMITS. CamelCase
// inputBytes values with a different policy (an overridable pwntools admission,
// historical capture intake) are not this budget.
check(
  "inline resident-input budget (use BOUNDED_PRODUCER_LIMITS from core/process/LinuxResourceLimits)",
  files,
  /input_bytes:\s*32 \* 1024 \* 1024/,
  ["core/process/LinuxResourceLimits.ts"],
);

// Fixed-arity backtick keys audited 2026-10-10: every prefix field is NUL-free
// (hex digests, file paths, enums, numbers, or compositeKey JSON which escapes
// NUL), with free-form source strings only in final position. New backtick-\0
// keys must either meet that shape (and extend this list with justification)
// or use compositeKey.
check(
  "new backtick-NUL composite key (audit against the rule above)",
  files,
  /`[^`\n]*\\0/,
  [
    // Bundle fingerprint: fixed packaged paths (no NUL/newline) and 64 hex
    // digest characters per record, never guide contents. Preserve v1 locators.
    "core/application/GuidanceAccess.ts",
    "core/application/javascript/ElectronBoundaryAnalysis.ts",
    "core/application/javascript/ElectronBoundaryGraphContext.ts",
    "core/application/javascript/JavaScriptArtifactGraphContext.ts",
    "core/browser/CdpCaptureCompleteness.ts",
    "core/browser/CdpCaptureEventHandlers.ts",
    "core/browser/CdpPageCapture.ts",
    "core/browser/WebSourceMapFetcher.ts",
    "core/domain/javascript/electronStaticAnalysisBrowser.ts",
    "core/domain/javascript/electronStaticAnalysisIpc.ts",
    "core/domain/javascript/javascriptApplicationChangeGraph.ts",
    "core/domain/javascript/javascriptApplicationVersionItems.ts",
    "core/domain/javascript/javascriptApplicationVersionKeys.ts",
    "core/domain/javascript/javascriptExportShapeSelection.ts",
    "core/domain/javascript/javascriptFeatureSeed.ts",
    "core/domain/javascript/javascriptFeatureTraversal.ts",
    "core/domain/javascript/javascriptNativeHandoff.ts",
    "core/domain/javascript/javascriptRuntimeReconciliationMatching.ts",
    "core/domain/javascript/javascriptRuntimeReconciliationSchemas.ts",
    "core/domain/javascript/javascriptSemanticQuery.ts",
    "core/domain/javascript/javascriptStaticAnalysisBundler.ts",
    "core/domain/javascript/javascriptStaticAnalysisCalls.ts",
    "core/domain/javascript/javascriptStaticAnalysisFindings.ts",
    "core/domain/localPath.ts",
    "core/domain/process/processTraceEvaluation.ts",
    "core/domain/process/processTraceSpecification.ts",
    "core/domain/unicodeCodePointOrder.ts",
    "core/domain/webBundleAnalyzerInspection.ts",
  ],
);

if (failures.length > 0) {
  console.error(`Architecture guards failed:\n\n${failures.join("\n\n")}\n`);
  process.exit(1);
}
console.log(`Architecture guards passed across ${files.length} source files.`);
