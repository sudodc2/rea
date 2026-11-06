import { projectCliAnalysisResult } from "../../../core/cli/projectCliAnalysisResult.js";
import { EventEmitter } from "node:events";
import { expect, it } from "vitest";
import { WasmArtifactService } from "../../../core/application/wasm/WasmArtifactService.js";
import { withCommandCancellation } from "../../../core/cli/commandCancellation.js";
import { finishAnalysisCommand } from "../../../core/cli/finishAnalysisCommand.js";
import { ok } from "../../../core/domain/result.js";
import {
  wasmArtifactExecution,
  wasmArtifactFixture,
} from "../../fixtures/wasm/artifact.js";

it("delivers cancellation with completed WASM Evidence through the CLI boundary", async () => {
  const value = wasmArtifactFixture();
  const events = new EventEmitter();
  const service = new WasmArtifactService({
    close: () => Promise.resolve(),
    inspect: async (_input, options) => {
      await new Promise<void>((resolve) =>
        options?.signal?.addEventListener("abort", () => resolve(), {
          once: true,
        }),
      );
      return ok(wasmArtifactExecution(value));
    },
  });
  const command = withCommandCancellation(
    (signal) =>
      finishAnalysisCommand(
        () => service.inspect({ path: value.artifact.path }, { signal }),
        service,
        "wabt-artifact",
        "inspect_wasm_artifact",
        signal,
      ).then(projectCliAnalysisResult),
    {
      on: events.on.bind(events),
      off: events.off.bind(events),
    },
  );

  events.emit("SIGINT");
  await expect(command).resolves.toMatchObject({
    code: "cancelled",
    details: {
      partial_observation: {
        normalized_result: value,
        confidence: "observed",
      },
    },
  });
});
