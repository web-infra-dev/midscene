import { describe, expect, it } from 'vitest';
import {
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
});
