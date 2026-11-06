import { completeJavaScriptAnalysisSteps } from "../../core/application/javascript/JavaScriptAnalysisControl.js";
import { buildImmutableJavaScriptArtifactGraphSteps } from "../../core/application/javascript/JavaScriptArtifactGraphBuilder.js";
import type { JavaScriptApplicationGraph } from "../../core/domain/javascript/javascriptApplicationGraph.js";

/** Drive the production immutable application graph builder for boundary tests. */
export const immutableArtifactGraph = (
  ...args: Parameters<typeof buildImmutableJavaScriptArtifactGraphSteps>
): Promise<JavaScriptApplicationGraph> =>
  completeJavaScriptAnalysisSteps(
    buildImmutableJavaScriptArtifactGraphSteps(...args),
  ).then(({ graph }) => graph);
