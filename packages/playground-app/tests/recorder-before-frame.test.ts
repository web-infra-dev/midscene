/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  RECORDER_PREVIEW_FRAME_MAX_LONG_EDGE,
  captureRecorderBeforeFrameFromScrcpy,
  waitForScrcpyFrameAfter,
} from '../src/recorder-before-frame';

afterEach(() => {
  rs.restoreAllMocks();
  rs.useRealTimers();
});

describe('recorder preview before-frame', () => {
  it('serializes the decoder snapshot retained from the current scrcpy frame', async () => {
    const frame = await captureRecorderBeforeFrameFromScrcpy(
      Promise.resolve({
        blob: new Blob(['png'], { type: 'image/png' }),
        capturedAt: 123,
        width: 1600,
        height: 800,
      }),
    );

    expect(frame).toMatchObject({
      width: 1600,
      height: 800,
      source: 'studio-scrcpy-preview',
      capturedAt: 123,
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
    });
  });

  it('gives up without blocking the action when decoder capture stalls', async () => {
    await expect(
      captureRecorderBeforeFrameFromScrcpy(new Promise(() => {}), 5),
    ).resolves.toBeUndefined();
  });

  it('rejects snapshots larger than the client/server frame contract', async () => {
    await expect(
      captureRecorderBeforeFrameFromScrcpy(
        Promise.resolve({
          blob: new Blob(['png'], { type: 'image/png' }),
          capturedAt: 123,
          width: RECORDER_PREVIEW_FRAME_MAX_LONG_EDGE + 1,
          height: 100,
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('only accepts a frame observed after the previous action completed', async () => {
    rs.useFakeTimers();
    let latest = { sequence: 4, receivedAt: 100 };
    const pending = waitForScrcpyFrameAfter(() => latest, 4, 120, 50);

    latest = { sequence: 5, receivedAt: 110 };
    await rs.advanceTimersByTimeAsync(10);
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    latest = { sequence: 6, receivedAt: 125 };
    await rs.advanceTimersByTimeAsync(5);
    await expect(pending).resolves.toEqual(latest);
  });
});
