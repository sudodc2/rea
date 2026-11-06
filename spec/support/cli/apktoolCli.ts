import { Cli } from "incur";
import pino from "pino";

import type { ApktoolResourceAnalysisPort } from "../../../core/application/apktool/ApktoolResourceAnalysisPort.js";
import { createAnalysisExecution } from "../../../core/application/AnalysisProvider.js";
import { registerApktoolCommands } from "../../../core/cli/apktoolCommands.js";
import { presentOmittableDefaults } from "../../../core/cli/omittableDefaults.js";
import type { ApktoolRequest } from "../../../core/domain/apktool/apktoolResourceAnalysis.js";
import { ok } from "../../../core/domain/result.js";

export const invokeApktoolCli = async (argv: readonly string[]) => {
  const requests: ApktoolRequest[] = [];
  const provider: ApktoolResourceAnalysisPort = {
    async inspectAvailability() {
      throw new Error("unexpected provider probe");
    },
    async close() {},
    async execute(request) {
      requests.push(request);
      return ok(
        createAnalysisExecution(
          { strings: [] },
          { id: "apktool", name: "Apktool", version: null },
        ),
      );
    },
  };
  const cli = Cli.create("rea", { sync: false });
  registerApktoolCommands(cli, pino({ level: "silent" }), {}, provider);
  presentOmittableDefaults(cli);

  let stdout = "";
  let exitCode = 0;
  await cli.serve([...argv], {
    env: {},
    exit: (code) => {
      exitCode = code;
    },
    stdout: (text) => {
      stdout += text;
    },
  });
  return { exitCode, stdout, requests };
};
