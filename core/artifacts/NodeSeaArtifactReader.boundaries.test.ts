import { artifactReaderLifecycleCases } from "../../spec/fixtures/artifactReaderLifecycle.js";
import { nodeSeaElf } from "./nodeSea/NodeSea.fixture.js";
import { NodeSeaArtifactReader } from "./NodeSeaArtifactReader.js";

artifactReaderLifecycleCases({
  image: () => nodeSeaElf({ fuse: "set" }),
  createReader: (path, admitted) => new NodeSeaArtifactReader(path, admitted),
});
