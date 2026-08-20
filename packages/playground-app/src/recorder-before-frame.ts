import type { PlaygroundRecorderBeforeFrame } from '@midscene/playground';

// ScrcpyPanel currently requests a 1600px stream. Keep a slightly larger hard
// boundary so future preview tuning cannot silently send full device frames.
export const RECORDER_PREVIEW_FRAME_MAX_LONG_EDGE = 2048;
export const RECORDER_PREVIEW_FRAME_ENCODE_TIMEOUT_MS = 100;
export const RECORDER_PREVIEW_FRAME_WAIT_MS = 50;

export interface ScrcpyFrameObservation {
  sequence: number;
  receivedAt: number;
}

export interface ScrcpyFrameCaptureResult {
  blob: Blob;
  capturedAt: number;
  width: number;
  height: number;
}

export type ScrcpyFrameCapture = () => Promise<
  ScrcpyFrameCaptureResult | undefined
>;

function readBlobAsDataUrl(
  capture: Promise<ScrcpyFrameCaptureResult | undefined>,
  timeoutMs: number,
): Promise<PlaygroundRecorderBeforeFrame | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (frame?: PlaygroundRecorderBeforeFrame) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(frame);
    };
    const timeout = setTimeout(() => finish(), timeoutMs);

    void capture.then(
      (result) => {
        if (
          settled ||
          !result ||
          result.width <= 0 ||
          result.height <= 0 ||
          Math.max(result.width, result.height) >
            RECORDER_PREVIEW_FRAME_MAX_LONG_EDGE ||
          (result.blob.type !== 'image/png' &&
            result.blob.type !== 'image/jpeg')
        ) {
          finish();
          return;
        }
        try {
          const reader = new FileReader();
          reader.onerror = () => finish();
          reader.onload = () => {
            const dataUrl =
              typeof reader.result === 'string' ? reader.result : undefined;
            finish(
              dataUrl
                ? {
                    dataUrl,
                    capturedAt: result.capturedAt,
                    width: result.width,
                    height: result.height,
                    source: 'studio-scrcpy-preview',
                  }
                : undefined,
            );
          };
          reader.readAsDataURL(result.blob);
        } catch {
          finish();
        }
      },
      () => finish(),
    );
  });
}

export function captureRecorderBeforeFrameFromScrcpy(
  capture: Promise<ScrcpyFrameCaptureResult | undefined>,
  timeoutMs = RECORDER_PREVIEW_FRAME_ENCODE_TIMEOUT_MS,
): Promise<PlaygroundRecorderBeforeFrame | undefined> {
  return readBlobAsDataUrl(capture, timeoutMs);
}

export function waitForScrcpyFrameAfter(
  getLatest: () => ScrcpyFrameObservation,
  sequence: number,
  receivedAt: number,
  timeoutMs = RECORDER_PREVIEW_FRAME_WAIT_MS,
): Promise<ScrcpyFrameObservation | undefined> {
  const readEligibleFrame = () => {
    const latest = getLatest();
    return latest.sequence > sequence && latest.receivedAt >= receivedAt
      ? latest
      : undefined;
  };
  const current = readEligibleFrame();
  if (current || timeoutMs <= 0) {
    return Promise.resolve(current);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (frame?: ScrcpyFrameObservation) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      resolve(frame);
    };
    const poll = setInterval(() => {
      const frame = readEligibleFrame();
      if (frame) finish(frame);
    }, 5);
    const timeout = setTimeout(() => finish(), timeoutMs);
  });
}
