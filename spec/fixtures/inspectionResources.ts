import { ArtifactResourceScope } from "../../core/artifacts/ArtifactResourceScope.js";
import { AnalysisCleanupLease } from "../../core/artifacts/AnalysisCleanupLease.js";
import type { RetainedResourceScope } from "../../core/application/AnalysisProvider.js";

/** Test-scoped real inspection leases; every retained owner is closed by the fixture. */
export const createInspectionResources = () => {
  const scope = new ArtifactResourceScope();
  const owner: RetainedResourceScope = {
    retain: (resourceOwner, resource) =>
      scope.retain({
        kind: "lease",
        resource,
        lease: AnalysisCleanupLease.forCloseOwner(resourceOwner, resource),
      }),
    run: (operation) => scope.run(operation),
  };
  return { owner, close: () => scope.close() };
};
