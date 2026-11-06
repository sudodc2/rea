import { matchesGlob } from "node:path";

/** Canonical file ownership shared by Vitest and development-test planning. */
export const SOURCE_TEST_PROJECTS = [
  {
    name: "domain",
    group: "source",
    isolate: false,
    include: ["core/{contracts,domain}/**/*.test.ts"],
  },
  {
    name: "services",
    group: "source",
    isolate: false,
    include: ["core/application/**/*.test.ts"],
  },
  {
    name: "adapters",
    group: "source",
    include: [
      "core/*.test.ts",
      "core/{android,apkSignature,apktool,jeb,adb,artifacts,browser,config,cutter,desktop,dotnet,electron,erlang,evm,firmware,flutter,frida,pcap,ghidra,go,gpu,hopper,ida,inspector,javascript,main,native,process,providers,python,reference,rust,server,sqlite,wasm,windows}/**/*.test.ts",
    ],
  },
  {
    name: "composition",
    group: "source",
    isolate: false,
    include: ["spec/composition/**/*.test.ts"],
  },
  {
    name: "conformance",
    group: "source",
    isolate: false,
    include: ["spec/conformance/**/*.test.ts"],
    exclude: ["spec/conformance/providers/hopper/realHopperSearch.test.ts"],
  },
  {
    name: "evaluation",
    group: "source",
    isolate: false,
    include: ["spec/evaluation/**/*.test.ts"],
  },
];

export const BUILT_TEST_PROJECTS = [
  {
    name: "boundary",
    group: "built",
    include: [
      "spec/boundary/**/*.test.ts",
      "spec/conformance/providers/hopper/realHopperSearch.test.ts",
    ],
    exclude: [
      "spec/boundary/cli/**/*.test.ts",
      "spec/boundary/mcp/**/*.test.ts",
      "spec/boundary/process/**/*.test.ts",
    ],
  },
  {
    name: "cli-boundary",
    group: "built",
    isolate: false,
    include: ["spec/boundary/cli/**/*.test.ts"],
  },
  {
    name: "process-boundary",
    group: "built",
    include: ["spec/boundary/process/**/*.test.ts"],
  },
  {
    name: "mcp-boundary",
    group: "built",
    isolate: false,
    include: ["spec/boundary/mcp/**/*.test.ts"],
  },
  {
    name: "acceptance",
    group: "built",
    include: ["spec/acceptance/**/*.test.ts"],
  },
  {
    name: "process-global",
    group: "built",
    include: ["spec/process-global/**/*.test.ts"],
  },
];

const ALL_TEST_PROJECTS = [...SOURCE_TEST_PROJECTS, ...BUILT_TEST_PROJECTS];

/** Return the unique Vitest owner for an exact repository-relative test path. */
export const projectForTest = (testPath) => {
  if (
    typeof testPath !== "string" ||
    testPath.startsWith("/") ||
    testPath.includes("\\") ||
    testPath.split("/").some((part) => part === ".." || part === ".") ||
    !testPath.endsWith(".test.ts")
  )
    throw new Error(`Expected a normalized repository test path: ${testPath}`);

  const owners = ALL_TEST_PROJECTS.filter(
    ({ include, exclude = [] }) =>
      include.some((pattern) => matchesGlob(testPath, pattern)) &&
      !exclude.some((pattern) => matchesGlob(testPath, pattern)),
  );
  if (owners.length !== 1)
    throw new Error(
      owners.length === 0
        ? `No test project owns ${testPath}`
        : `Multiple test projects own ${testPath}: ${owners.map(({ name }) => name).join(", ")}`,
    );
  return owners[0];
};
