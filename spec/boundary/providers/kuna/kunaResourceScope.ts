import { createInspectionResources } from "../../../fixtures/inspectionResources.js";
import type { RetainedResourceScope } from "../../../../core/application/AnalysisProvider.js";
import type { KunaInstallationOptions } from "../../../../core/kuna/KunaInstallation.js";
import { inspectKunaInstallation } from "../../../../core/kuna/KunaInstallation.js";
import { inspectKunaProvider } from "../../../../core/kuna/KunaDoctor.js";

export const withKunaResourceScope = async <T>(
  operation: (owner: RetainedResourceScope) => Promise<T>,
): Promise<T> => {
  const scope = createInspectionResources();
  try {
    return await operation(scope.owner);
  } finally {
    await scope.close();
  }
};

export const inspectKunaInstallationOwned = (
  environment: Readonly<NodeJS.ProcessEnv>,
  options: Omit<KunaInstallationOptions, "resourceScope"> = {},
) =>
  withKunaResourceScope((resourceScope) =>
    inspectKunaInstallation(environment, { ...options, resourceScope }),
  );

export const inspectKunaProviderOwned = (
  environment: Readonly<NodeJS.ProcessEnv>,
  platform?: NodeJS.Platform,
) =>
  withKunaResourceScope((resourceScope) =>
    inspectKunaProvider(environment, platform, { resourceScope }),
  );
