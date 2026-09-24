# Screenshot pipeline maintenance notes

## Contract

`EncodedImage` holds encoded PNG/JPEG/WebP bytes. It takes ownership without a
copy; producers and consumers must not mutate those bytes. Its dimensions are
read from the encoded header on demand and cached. Base64 is an interchange
representation, not the in-memory screenshot storage format.

`transformImage(image, { operations, output })` applies ordered crop, resize,
padding and RGBA overlay operations. Coordinates refer to the preceding result.
It returns the original image when neither pixel changes nor format conversion
are needed. Supplying a quality does not force an otherwise unnecessary encode.
Omitting output preserves the input format; explicit PNG output is lossless.

Backend implementations own decoder objects, intermediate pixels and final
encoding. Sharp intermediates are raw RGBA to prevent operation reordering and
intermediate lossy encoding. Photon releases replaced images and the final image
on success or failure. Photon padding consumes its Rgba argument: create one per
call and do not free it in JavaScript. Overlay rendering produces pixels without
decoding or encoding an image.

The single-encoding guarantee is per pipeline invocation, not across unrelated
calls. Callers submit a compound operation together, as the grounding and
deep-description paths do. UIContext retains the original capture; shotSize is
the coordinate space used by consumers. Context shrinking is composed with
crop, annotation and model padding before final encoding.

## Consumer boundaries

- `captureDeviceScreenshot` prefers an optional byte-native device method and
  adapts existing `screenshotBase64` implementations. Playwright and Puppeteer use
  the byte-native path; other device adapters remain supported without migration.
- `prepareRawScreenshot` plans context geometry without encoding. Consumers use
  `prepareContextImage` or `prepareModelImage` to apply shotSize before crop,
  overlays or padding. Report overlays use this coordinate space independently
  of the original capture resolution. Do not assume screenshot.size == shotSize.
- Core's `prepareImageOutput` owns consumer compression policy: preserve existing
  JPEG/WebP, prefer WebP for PNG. Model preprocessing owns block-alignment rules;
  the image backend receives explicit padding, not model configuration.
- `ScreenshotItem` stores bytes, writes them directly, and releases them after
  persistence. File/HTML recovery and dump references retain their existing
  lifecycle. Plain JSON transport exposes Base64, never the internal buffer.
- Observation persistence accepts encoded images directly. Its string overload
  is an input compatibility boundary. Report storage does not inherit model
  compression or mutate the screenshot when preparing model messages.
- No model image format environment setting is introduced. A future provider
  compatibility requirement must select encoding before processing rather than
  converting all inputs to WebP and converting them back at the request boundary.
- `callAI` is a transport boundary, not an image processor. Inline reference
  images are prepared at the multimodal input boundary. Remote URLs pass through.

## Compatibility and scope

Existing public Base64 helpers are retained, including the legacy resize API's
same-size behavior. These wrappers now use ImageBackend, not duplicate Sharp and
Photon implementations. Node's legacy resize uses cover; the coordinate pipeline
uses fill. Explicit conversion/crop/scale APIs still encode, including identity
operations, whereas pipeline no-ops reuse bytes. Photon-object APIs remain in an
isolated compatibility module because their public signatures expose ownership.
Public `zoomForGPT4o` and `processImageElementInfo` exports are not
deleted merely because there are no in-repository production callers.

No device is switched to PNG capture. Native-device rollout, compression-quality
tuning, model recognition comparisons and cross-device capture latency require
their own measurements. Browser/worker WebP quality is implemented by Canvas and
is not assumed to produce the same bytes as Sharp.

`image-backend.ts` owns backend selection. `backends/sharp.ts` and
`backends/photon.ts` implement the same info/transform contract. Canvas currently
provides the browser WebP codec in `backends/canvas.ts`; it is a backend dependency,
not a business-layer dependency or a general canvas transformation engine.
Browser consumers include workers and extensions as well as report Playground.
Removing that codec requires replacing or disabling browser WebP encoding; merely
deleting a file cannot preserve that capability.

## Review checklist

1. No-op JPEG/WebP returns the same bytes/object; quality options do not cause
   generation loss.
2. Crop/resize/pad/overlay ordering preserves dimensions and coordinate mapping.
3. Compound operations have no intermediate JPEG/WebP encoding.
4. Model output preparation does not mutate report sources.
5. Byte persistence, memory release, HTML/file recovery and JSON transport work.
6. Old devices remain valid; byte-native capture avoids Base64 round trips.
7. Both backend success and failure paths release owned objects. Exercise actual
   Photon WASM as well as mocks, since argument ownership is binding-specific.

Tests for these contracts live in shared's `pipeline*.test.ts` and
`observation-record.test.ts`, and core's `image-output.test.ts`,
`device-screenshot.test.ts`, screenshot, grounding and description suites.
