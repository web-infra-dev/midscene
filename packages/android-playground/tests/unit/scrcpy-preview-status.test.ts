import { describe, expect, it } from '@rstest/core';
import {
  buildScrcpyPreviewErrorEvent,
  buildScrcpyPreviewStatusEvent,
  getScrcpyPreviewStatusMessage,
} from '../../src/scrcpy-preview-status';

describe('scrcpy preview status helpers', () => {
  it('maps backend phases to user-facing progress messages', () => {
    expect(getScrcpyPreviewStatusMessage('connecting-device')).toBe(
      'Preparing Android device connection…',
    );
    expect(getScrcpyPreviewStatusMessage('pushing-server')).toBe(
      'Uploading scrcpy runtime to device…',
    );
    expect(getScrcpyPreviewStatusMessage('starting-service')).toBe(
      'Starting scrcpy service…',
    );
    expect(getScrcpyPreviewStatusMessage('waiting-for-video')).toBe(
      'Waiting for first video frame…',
    );
  });

  it('builds the socket payload with phase and message', () => {
    expect(buildScrcpyPreviewStatusEvent('starting-service')).toEqual({
      phase: 'starting-service',
      message: 'Starting scrcpy service…',
    });
  });

  it('marks transient stream failures as recoverable', () => {
    expect(
      buildScrcpyPreviewErrorEvent('stream-ended', 'socket:1', 'stream ended'),
    ).toEqual({
      reason: 'stream-ended',
      sessionId: 'socket:1',
      message: 'stream ended',
      recoverable: true,
    });
    expect(
      buildScrcpyPreviewErrorEvent('adb-unavailable', 'socket:2', 'no device')
        .recoverable,
    ).toBe(false);
  });
});
