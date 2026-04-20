import { describe, expect, it } from 'vitest';
import {
  getDefaultScrcpyWaitingStatusText,
  getScrcpyDecoderStatusText,
  getScrcpyMetadataTimeoutMessage,
  getScrcpyPreviewStatusText,
  isScrcpyPreviewStatusEvent,
} from '../src/scrcpy-preview';

describe('scrcpy preview helpers', () => {
  it('returns specific status text for each preview stage', () => {
    expect(getScrcpyPreviewStatusText('connecting')).toBe(
      'Connecting to scrcpy preview server…',
    );
    expect(getScrcpyPreviewStatusText('waiting-for-stream')).toBe(
      'Preparing Android device connection…',
    );
    expect(
      getScrcpyPreviewStatusText(
        'waiting-for-stream',
        'Starting scrcpy service…',
      ),
    ).toBe('Starting scrcpy service…');
    expect(getScrcpyPreviewStatusText('connected')).toBe(
      'Live scrcpy preview connected',
    );
  });

  it('exposes helper text for waiting and decoder phases', () => {
    expect(getDefaultScrcpyWaitingStatusText()).toBe(
      'Preparing Android device connection…',
    );
    expect(getScrcpyDecoderStatusText()).toBe('Starting video decoder…');
  });

  it('recognizes preview status events from the backend', () => {
    expect(
      isScrcpyPreviewStatusEvent({
        phase: 'starting-service',
        message: 'Starting scrcpy service…',
      }),
    ).toBe(true);
    expect(isScrcpyPreviewStatusEvent({ phase: 'starting-service' })).toBe(
      false,
    );
    expect(isScrcpyPreviewStatusEvent('Starting scrcpy service…')).toBe(false);
  });

  it('formats the metadata timeout message in seconds', () => {
    expect(getScrcpyMetadataTimeoutMessage(12_000)).toBe(
      'Timed out waiting 12s for scrcpy video stream metadata.',
    );
  });
});
