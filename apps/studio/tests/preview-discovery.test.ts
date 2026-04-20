import type { PlaygroundRuntimeInfo } from '@midscene/playground';
import { describe, expect, it } from 'vitest';
import {
  type StudioPreviewConnectionState,
  shouldPauseDiscoveryPollingDuringPreview,
} from '../src/renderer/playground/preview-discovery';

function createRuntimeInfo(
  previewKind: PlaygroundRuntimeInfo['preview']['kind'],
): PlaygroundRuntimeInfo {
  return {
    interface: {
      type: 'android',
    },
    metadata: {},
    executionUxHints: [],
    preview: {
      kind: previewKind,
      capabilities: [],
    },
    platformId: 'android',
  };
}

function expectPauseDecision(
  previewStatus: StudioPreviewConnectionState,
  expected: boolean,
) {
  expect(
    shouldPauseDiscoveryPollingDuringPreview({
      previewStatus,
      runtimeInfo: createRuntimeInfo('scrcpy'),
      sessionConnected: true,
    }),
  ).toBe(expected);
}

describe('shouldPauseDiscoveryPollingDuringPreview', () => {
  it('pauses discovery while a scrcpy preview is still starting', () => {
    expectPauseDecision(null, true);
    expectPauseDecision('connecting', true);
    expectPauseDecision('waiting-for-stream', true);
  });

  it('resumes discovery once the scrcpy preview has settled', () => {
    expectPauseDecision('connected', false);
    expectPauseDecision('error', false);
    expectPauseDecision('disconnected', false);
  });

  it('does not pause discovery for non-scrcpy previews or disconnected sessions', () => {
    expect(
      shouldPauseDiscoveryPollingDuringPreview({
        previewStatus: 'connecting',
        runtimeInfo: createRuntimeInfo('screenshot'),
        sessionConnected: true,
      }),
    ).toBe(false);
    expect(
      shouldPauseDiscoveryPollingDuringPreview({
        previewStatus: 'connecting',
        runtimeInfo: createRuntimeInfo('scrcpy'),
        sessionConnected: false,
      }),
    ).toBe(false);
  });
});
