import type { BrowserObservationPort } from "../../core/application/BrowserObservationPort.js";
import type { JavaScriptRuntimeObservationPort } from "../../core/application/javascript/JavaScriptRuntimeObservationPort.js";
import { CDP_BROWSER_PROVIDER_IDENTITY } from "../../core/browser/providerIdentities.js";
import { V8_INSPECTOR_PROVIDER_IDENTITY } from "../../core/inspector/providerIdentity.js";
import { createBrowserScenarioProvider } from "../../core/composition/browserScenario.js";
import { createElectronObservationProvider } from "../../core/composition/electronObservation.js";
import { createElectronScenarioProvider } from "../../core/composition/electronScenario.js";
import type { OptionalObservationFactories } from "../../core/composition/optionalObservationProviders.js";
import { AnalysisCapabilityUnavailableError } from "../../core/domain/analysisErrorCore.js";
import { err, ok } from "../../core/domain/result.js";

const unselected = async () =>
  err(
    new AnalysisCapabilityUnavailableError(
      "recording-fixture",
      "unselected",
      "This fixture implements target listing only",
    ),
  );

/** Recording ports exercise application composition without claiming real engines. */
export const optionalObservationFactories = (
  calls: string[],
): OptionalObservationFactories => {
  const browser: BrowserObservationPort = {
    identity: () => CDP_BROWSER_PROVIDER_IDENTITY,
    listTargets: async () => {
      calls.push("browser");
      return ok({
        browser: {
          product: "Recording browser",
          protocol_version: "1.3",
          revision: "fixture",
          user_agent: "fixture",
          js_version: "fixture",
        },
        targets: [],
        excluded: { disallowed_origin: 0, unsupported_url: 0, non_page: 0 },
        limitations: ["Recording port; no real browser was connected."],
      });
    },
    inspectPage: unselected,
    analyzeBundle: unselected,
    observeSession: unselected,
    discoverWebMcpTools: unselected,
    compareCaptures: unselected,
    captureScreenshot: unselected,
    compareScreenshots: unselected,
  };
  const runtime: JavaScriptRuntimeObservationPort = {
    identity: () => V8_INSPECTOR_PROVIDER_IDENTITY,
    listTargets: async () => {
      calls.push("runtime");
      return ok({
        runtime: {
          product: "Recording Node.js",
          protocol_version: "1.0",
          v8_version: null,
        },
        targets: [],
        excluded: { unsupported_location: 0, unconnectable: 0 },
        limitations: ["Recording port; no real Inspector was connected."],
      });
    },
    observe: unselected,
  };
  return {
    browserObservation: async () => browser,
    browserScenarioCapture: async () => createBrowserScenarioProvider({}),
    electronObservation: async () => createElectronObservationProvider({}),
    electronActiveObservation: async () => createElectronScenarioProvider({}),
    javascriptRuntimeObservation: async () => runtime,
  };
};
