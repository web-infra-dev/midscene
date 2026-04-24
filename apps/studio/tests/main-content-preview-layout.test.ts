import type { PlaygroundRuntimeInfo } from '@midscene/playground';
import { describe, expect, it } from 'vitest';
import {
  fitMobilePreviewViewport,
  resolveStudioPreviewPlatform,
  shouldEnableMobilePreviewFrame,
  shouldUseMobilePreviewFrame,
} from '../src/renderer/components/MainContent/preview-layout';

function createRuntimeInfo(
  platformId: PlaygroundRuntimeInfo['platformId'],
  interfaceType?: string,
): PlaygroundRuntimeInfo {
  return {
    platformId,
    interface: {
      type: interfaceType ?? platformId,
    },
    metadata: {},
    executionUxHints: [],
    preview: {
      kind: 'none',
      capabilities: [],
    },
  };
}

describe('resolveStudioPreviewPlatform', () => {
  it('prefers the runtime platform when a session is already connected', () => {
    expect(
      resolveStudioPreviewPlatform(createRuntimeInfo('ios'), {
        platformId: 'computer',
      }),
    ).toBe('ios');
  });

  it('falls back to the selected form platform before connection starts', () => {
    expect(
      resolveStudioPreviewPlatform(null, { platformId: 'harmonyos' }),
    ).toBe('harmony');
  });

  it('normalizes desktop aliases to computer', () => {
    expect(
      resolveStudioPreviewPlatform(createRuntimeInfo('computer', 'macos'), {}),
    ).toBe('computer');
  });
});

describe('shouldUseMobilePreviewFrame', () => {
  it('enables the framed preview for mobile platforms', () => {
    expect(shouldUseMobilePreviewFrame(createRuntimeInfo('android'), {})).toBe(
      true,
    );
    expect(
      shouldUseMobilePreviewFrame(createRuntimeInfo('ios'), {
        platformId: 'computer',
      }),
    ).toBe(true);
    expect(shouldUseMobilePreviewFrame(null, { platformId: 'harmony' })).toBe(
      true,
    );
  });

  it('keeps the desktop layout for computer and web previews', () => {
    expect(shouldUseMobilePreviewFrame(createRuntimeInfo('computer'), {})).toBe(
      false,
    );
    expect(shouldUseMobilePreviewFrame(createRuntimeInfo('web'), {})).toBe(
      false,
    );
  });
});

describe('shouldEnableMobilePreviewFrame', () => {
  it('keeps scrcpy connecting overlays full width until the stream is live', () => {
    expect(
      shouldEnableMobilePreviewFrame(
        {
          ...createRuntimeInfo('android'),
          preview: {
            kind: 'scrcpy',
            capabilities: [{ kind: 'scrcpy' }],
          },
        },
        {},
        true,
        'connecting',
      ),
    ).toBe(false);
    expect(
      shouldEnableMobilePreviewFrame(
        {
          ...createRuntimeInfo('android'),
          preview: {
            kind: 'scrcpy',
            capabilities: [{ kind: 'scrcpy' }],
          },
        },
        {},
        true,
        'connected',
      ),
    ).toBe(true);
  });

  it('enables the mobile frame for connected non-scrcpy previews', () => {
    expect(
      shouldEnableMobilePreviewFrame(
        {
          ...createRuntimeInfo('ios'),
          preview: {
            kind: 'mjpeg',
            mjpegPath: '/mjpeg',
            capabilities: [{ kind: 'mjpeg' }],
          },
        },
        {},
        true,
        null,
      ),
    ).toBe(true);
  });

  it('disables the mobile frame when no session is connected', () => {
    expect(
      shouldEnableMobilePreviewFrame(
        createRuntimeInfo('android'),
        {},
        false,
        null,
      ),
    ).toBe(false);
  });
});

describe('fitMobilePreviewViewport', () => {
  it('preserves vertical gutter when height is the limiting factor', () => {
    const viewport = fitMobilePreviewViewport(380, 820);

    expect(viewport.height).toBeLessThan(820);
    expect(820 - viewport.height).toBeGreaterThanOrEqual(56);
  });

  it('caps the viewport by width when the stage is narrow', () => {
    const viewport = fitMobilePreviewViewport(280, 820);

    expect(viewport.width).toBeLessThan(280);
    expect(viewport.height).toBeLessThan(820);
  });
});
