import { describe, expect, it } from 'vitest';
import {
  buildConversationBranding,
  buildConversationConfig,
} from '../src/controller/selectors';

describe('buildConversationConfig', () => {
  it('uses the shared Studio-style playground chrome by default', () => {
    expect(
      buildConversationConfig({
        deviceType: 'android',
        executionUxHints: ['countdown-before-run'],
        countdownSeconds: 5,
      }),
    ).toMatchObject({
      showContextPreview: false,
      layout: 'vertical',
      showVersionInfo: false,
      enableScrollToBottom: false,
      showEnvConfigReminder: false,
      showClearButton: false,
      showSystemMessageHeader: false,
      serverMode: true,
      deviceType: 'android',
      promptInputChrome: {
        variant: 'minimal',
        placeholder: 'Type a message',
        primaryActionLabel: 'Action',
      },
      executionFlow: {
        collapsible: true,
      },
      executionUx: {
        hints: ['countdown-before-run'],
        countdownSeconds: 5,
      },
    });
  });

  it('preserves shared execution flow defaults when hosts add partial overrides', () => {
    expect(
      buildConversationConfig(
        {
          deviceType: 'web',
          executionUxHints: [],
          countdownSeconds: 3,
        },
        {
          executionFlow: {
            label: 'Process',
          },
        },
      ),
    ).toMatchObject({
      executionFlow: {
        collapsible: true,
        label: 'Process',
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
