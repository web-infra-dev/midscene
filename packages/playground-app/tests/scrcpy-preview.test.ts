import { describe, expect, it } from '@rstest/core';
import {
  canRecoverScrcpyPreview,
  getDefaultScrcpyWaitingStatusText,
  getScrcpyDecoderStatusText,
  getScrcpyMetadataTimeoutMessage,
  getScrcpyPreviewStatusText,
  getScrcpyRecoveryDelayMs,
  isScrcpyPreviewErrorEvent,
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
      'Timed out waiting 12s for scrcpy video stream data.',
    );
  });

  it('validates structured backend errors', () => {
    expect(
      isScrcpyPreviewErrorEvent({
        message: 'ended',
        reason: 'stream-ended',
        recoverable: true,
        sessionId: 'socket:1',
      }),
    ).toBe(true);
    expect(isScrcpyPreviewErrorEvent({ message: 'ended' })).toBe(false);
  });

  it('bounds recovery by attempt count and elapsed time', () => {
    expect(canRecoverScrcpyPreview(true, 5, 14_999)).toBe(true);
    expect(canRecoverScrcpyPreview(true, 6, 1_000)).toBe(false);
    expect(canRecoverScrcpyPreview(true, 2, 15_000)).toBe(false);
    expect(canRecoverScrcpyPreview(false, 2, 1_000)).toBe(false);
    expect([1, 2, 3, 4, 5].map(getScrcpyRecoveryDelayMs)).toEqual([
      1_000, 2_000, 3_000, 3_000, 3_000,
    ]);
  });
});
