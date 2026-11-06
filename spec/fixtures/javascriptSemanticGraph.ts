import { createJavaScriptSemanticGraphProjection } from "../../core/application/javascript/JavaScriptSemanticGraphBuilder.js";
import type { JavaScriptArtifactFile } from "../../core/domain/javascript/javascriptArtifactFiles.js";
import type { JavaScriptSemanticIr } from "../../core/domain/javascript/javascriptSemanticIr.js";
import { analyzeJavaScriptSemantics } from "../../core/domain/javascript/javascriptSemanticAnalysis.js";

const SHA256 = "a".repeat(64);

/** Build a semantic graph from one source file for application-level tests. */
export const graphForJavaScript = (
  source: string,
  ir: JavaScriptSemanticIr = analyzeJavaScriptSemantics(source),
) => {
  const file: JavaScriptArtifactFile = {
    path: "app.js",
    container_sha256: SHA256,
    sha256: SHA256,
    bytes: Buffer.byteLength(source),
    inventory_artifact_id: `art_${SHA256}`,
    kind: "javascript",
    unpacked: false,
    text: { included: true, value: source },
  };
  const projection = createJavaScriptSemanticGraphProjection();
  projection.projectFile(file, ir);
  return projection.finish(SHA256, {
    graph_id: `jag_${"b".repeat(64)}`,
    nodes: [],
  });
};
