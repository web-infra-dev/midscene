import { describe, expect, it } from 'vitest';
import {
  buildConversationBranding,
  buildConversationConfig,
} from '../src/controller/selectors';

describe('buildConversationConfig', () => {
  it('uses controller execution hints and countdown by default', () => {
    expect(
      buildConversationConfig({
        deviceType: 'android',
        executionUxHints: ['countdown-before-run'],
        countdownSeconds: 5,
      }),
    ).toMatchObject({
      showContextPreview: false,
      layout: 'vertical',
      serverMode: true,
      deviceType: 'android',
      executionUx: {
        hints: ['countdown-before-run'],
        countdownSeconds: 5,
      },
    });
  });
});

describe('buildConversationBranding', () => {
  it('prefers runtime title and platform id', () => {
    expect(
      buildConversationBranding(
        {
          title: 'Midscene Android Playground',
          platformId: 'android',
          interface: { type: 'android' },
          preview: { kind: 'none', capabilities: [] },
          executionUxHints: [],
          metadata: {},
        },
        'Playground',
        '1.0.0',
        'android',
        {
          targetName: 'screen',
        },
      ),
    ).toMatchObject({
      title: 'Midscene Android Playground',
      version: '1.0.0',
      targetName: 'android',
    });
  });
});
