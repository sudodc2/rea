import { JavaScriptJsonDocuments } from "../../core/application/javascript/JavaScriptJsonDocuments.js";
import {
  resolveArtifactPathByContext,
  type ResolveArtifactPathInput,
} from "../../core/application/javascript/JavaScriptArtifactPathResolution.js";

/** Resolve one standalone test request with its own JSON facts owner. */
export const resolveStandaloneArtifactPath = (
  input: Omit<ResolveArtifactPathInput, "jsonDocuments">,
) =>
  resolveArtifactPathByContext({
    ...input,
    jsonDocuments: new JavaScriptJsonDocuments(),
  });
