import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "spec/boundary/providers/CutterBridgeClient.test.ts",
      "spec/boundary/providers/RizinCommandTimeout.test.ts",
      "spec/boundary/providers/RizinTimeoutEvidence.test.ts",
      "spec/boundary/mcp/rizinPendingOutput.test.ts",
    ],
    pool: "forks",
    maxWorkers: 2,
    retry: 0,
    testTimeout: 60_000,
    runner: "./spec/processOwnershipRunner.ts",
  },
});
