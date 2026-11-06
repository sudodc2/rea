import type { WebPageInspection } from "../../../core/domain/browserObservationSchemas.js";
import type { WebBundleAnalysis } from "../../../core/domain/webBundleAnalysis.js";
import { analyzeCapturedWebScript } from "../../../core/domain/webBundleAnalyzer.js";
import { buildCapturedWebBundleAnalysis } from "../../../core/domain/webBundleAnalyzerResult.js";
import { isIncludedScript } from "../../../core/domain/webBundleAnalyzerState.js";

/** Compose the production script parser and result merger for semantic fixtures. */
export const analyzeWebBundleFixture = (
  inspection: WebPageInspection,
  sourceMaps: WebBundleAnalysis["observations"]["source_maps"] = {
    status: "not_requested",
    requested: 0,
    processed: 0,
    items: [],
  },
): WebBundleAnalysis => {
  const sourceScripts = inspection.scripts.items.filter(isIncludedScript);
  return buildCapturedWebBundleAnalysis(
    inspection,
    sourceMaps,
    sourceScripts.map(analyzeCapturedWebScript),
  );
};
