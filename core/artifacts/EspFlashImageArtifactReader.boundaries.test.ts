import { artifactReaderLifecycleCases } from "../../spec/fixtures/artifactReaderLifecycle.js";
import {
  ESP32C3_BOOTLOADER_SEGMENTS,
  espImage,
} from "../../spec/fixtures/espImage.js";
import { espFlashDump } from "../domain/firmware/espFlash.fixture.js";
import { EspFlashImageArtifactReader } from "./EspFlashImageArtifactReader.js";

artifactReaderLifecycleCases({
  image: () =>
    espFlashDump({
      bootloader: {
        at: 0,
        bytes: espImage({ segments: ESP32C3_BOOTLOADER_SEGMENTS }),
      },
    }),
  createReader: (path, admitted) =>
    new EspFlashImageArtifactReader(path, admitted),
});
