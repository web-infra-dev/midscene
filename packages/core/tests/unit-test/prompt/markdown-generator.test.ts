import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callAIWithStringResponse } from '../../../src/ai-model';
import { getModelRuntime } from '../../../src/ai-model/models';
import {
  createRecorderMarkdownReplayPrompt,
  generateRecorderMarkdownReplay,
} from '../../../src/ai-model/prompt/markdown-generator';
import type { ChromeRecordedEvent } from '../../../src/ai-model/prompt/recorder-generation-common';

vi.mock('../../../src/ai-model', () => ({
  callAIWithStringResponse: vi.fn(),
}));

const mockCallAIWithStringResponse = vi.mocked(callAIWithStringResponse);

const mockedModelConfig = {
  modelName: 'mock',
  modelDescription: 'mock',
  intent: 'default',
  slot: 'default',
} as const satisfies IModelConfig;
const mockedModelRuntime = getModelRuntime(mockedModelConfig);

const screenshot =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';

const mockEvents: ChromeRecordedEvent[] = [
  {
    type: 'navigation',
    timestamp: 1000,
    url: 'https://example.com',
    title: 'Example Page',
    screenshotAfter: screenshot,
    pageInfo: { width: 1280, height: 720 },
    hashId: 'nav-1',
  },
  {
    type: 'click',
    timestamp: 2000,
    semantic: {
      source: 'aiDescribe',
      status: 'ready',
      elementDescription: 'Primary action button',
    },
    screenshotWithBox: screenshot,
    pageInfo: { width: 1280, height: 720 },
    hashId: 'click-1',
  },
];

describe('markdown-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a compact aiAct-focused prompt with recorder data', () => {
    const prompt = createRecorderMarkdownReplayPrompt({
      target: {
        platformId: 'android',
        label: 'emulator-5554',
        values: { deviceId: 'emulator-5554' },
      },
      events: mockEvents,
      testName: 'Replay workflow',
      language: 'English',
    });

    const userMessage = prompt[1];
    const text = Array.isArray(userMessage.content)
      ? userMessage.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
      : '';

    expect(text).toContain('await agent.aiAct(markdownReplayPrompt)');
    expect(text).toContain('- Platform: android');
    expect(text).toContain('Target block:');
    expect(text).toContain('Replay goal:');
    expect(text).toContain('Reproduce the recorded user workflow exactly.');
    expect(text).toContain('Do not invent alternative navigation paths.');
    expect(text).toContain(
      'Do not target a placeholder character, typed character, caret, or inner text fragment inside the field.',
    );
    expect(text).toContain(
      'Do not include screenshots, image syntax, image paths, or reference-image names',
    );
    expect(text).toContain(
      'agent.aiAct(markdownReplayPrompt), which accepts text only and cannot receive attached images',
    );
    expect(text).toContain(
      'Never write Markdown image syntax such as ![step context](...)',
    );
    expect(text).toContain('./screenshots/... paths');
    expect(text).not.toContain('Stability rules for dynamic UI');
    expect(text).not.toContain('State-dependent UI');
    expect(text).not.toContain('Transient UI');
    expect(text).not.toContain('Authentication/session UI');
    expect(text).not.toContain('Repeated collections');
    expect(text).not.toContain('Volatile text');
    expect(text).toContain('"events"');
    expect(text).toContain('"screenshots"');
    expect(text).not.toContain('"eventCounts"');
    expect(text).not.toContain('"clickDescriptions"');
    expect(text).not.toContain('"inputDescriptions"');
    expect(text).not.toMatch(
      /\blogin\b|authorization|SMS|phone|one-tap|product|recommendations|hot search/i,
    );
    expect(text).toContain(
      'Write all human-readable Markdown instructions in English.',
    );
    expect(text).toContain('"screenshotRef": "screenshot-1"');
    expect(text).not.toContain('./screenshots/event-001-navigation.png');
    expect(text.length).toBeLessThan(8000);
  });

  it('includes sequence context for neighboring input events', () => {
    const prompt = createRecorderMarkdownReplayPrompt({
      target: {
        platformId: 'web',
        label: 'Web',
        values: { url: 'https://example.com' },
      },
      events: [
        mockEvents[0],
        {
          type: 'input',
          actionType: 'Input',
          timestamp: 2000,
          value: 'alpha',
          semantic: {
            source: 'heuristic',
            status: 'ready',
            elementDescription: 'input field in Example Page',
            confidence: 'low',
          },
          pageInfo: { width: 1280, height: 720 },
          hashId: 'input-1',
        },
        {
          type: 'click',
          actionType: 'Tap',
          timestamp: 2500,
          semantic: {
            source: 'aiDescribe',
            status: 'ready',
            elementDescription: 'secondary field',
          },
          pageInfo: { width: 1280, height: 720 },
          hashId: 'click-between-inputs',
        },
        {
          type: 'input',
          actionType: 'Input',
          timestamp: 3000,
          value: '123456',
          semantic: {
            source: 'heuristic',
            status: 'ready',
            elementDescription: 'input field in Example Page',
            confidence: 'low',
          },
          pageInfo: { width: 1280, height: 720 },
          hashId: 'input-2',
        },
      ],
      testName: 'Replay workflow',
    });

    const userMessage = prompt[1];
    const text = Array.isArray(userMessage.content)
      ? userMessage.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
      : '';

    expect(text).toContain('"inputIndex": 1');
    expect(text).toContain('"inputIndex": 2');
    expect(text).toContain('"typedText": "alpha"');
    expect(text).toContain('"typedText": "123456"');
    expect(text).toContain(
      'For input events, enter event.typedText/event.value exactly',
    );
    expect(text).toContain('"hasNeighborInput": true');
    expect(text).toContain('"neighborInputValues"');
    expect(text).toContain('"previousInputDescription"');
    expect(text).toContain('"nextActionDescription": "secondary field"');
  });

  it('includes next action context for field focus clicks', () => {
    const prompt = createRecorderMarkdownReplayPrompt({
      target: {
        platformId: 'web',
        label: 'Web',
        values: { url: 'https://example.com' },
      },
      events: [
        mockEvents[0],
        {
          type: 'click',
          actionType: 'Tap',
          timestamp: 2000,
          semantic: {
            source: 'aiDescribe',
            status: 'ready',
            elementDescription: 'the character "code" inside the field',
          },
          pageInfo: { width: 1280, height: 720 },
          hashId: 'click-focus',
        },
        {
          type: 'input',
          actionType: 'Input',
          timestamp: 2100,
          value: '002937',
          semantic: {
            source: 'aiDescribe',
            status: 'ready',
            elementDescription: 'verification code input field',
          },
          pageInfo: { width: 1280, height: 720 },
          hashId: 'input-code',
        },
      ],
      testName: 'Replay workflow',
    });

    const userMessage = prompt[1];
    const text = Array.isArray(userMessage.content)
      ? userMessage.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
      : '';

    expect(text).toContain('"hashId": "click-focus"');
    expect(text).toContain(
      '"nextActionDescription": "verification code input field"',
    );
  });

  it('omits oversized screenshot payloads from Markdown generation prompts', () => {
    const oversizedScreenshot = `data:image/png;base64,${'a'.repeat(700_000)}`;
    const prompt = createRecorderMarkdownReplayPrompt({
      target: {
        platformId: 'web',
        label: 'Web',
        values: { url: 'https://example.com' },
      },
      events: [
        {
          type: 'navigation',
          timestamp: 1000,
          url: 'https://example.com',
          title: 'Example Page',
          screenshotAfter: oversizedScreenshot,
          pageInfo: { width: 1280, height: 720 },
          hashId: 'nav-oversized',
        },
      ],
      testName: 'Replay workflow',
    });

    const userMessage = prompt[1];
    const content = Array.isArray(userMessage.content)
      ? userMessage.content
      : [];
    const text = content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');

    expect(content.some((part) => part.type === 'image_url')).toBe(false);
    expect(text).not.toContain('./screenshots/event-001-navigation.png');
    expect(text).toContain('"hashId": "nav-oversized"');
  });

  it('omits fallback audit chains before building Markdown prompts', () => {
    const longError = `verify failed: ${'x'.repeat(5000)}`;
    const prompt = createRecorderMarkdownReplayPrompt({
      target: {
        platformId: 'web',
        label: 'Web',
        values: { url: 'https://example.com' },
      },
      events: [
        {
          type: 'click',
          actionType: 'Tap',
          timestamp: 1000,
          semantic: {
            source: 'recorderAI',
            status: 'ready',
            elementDescription: 'Submit button',
            error: longError,
            fallbackFrom: {
              source: 'aiDescribe',
              status: 'failed',
              error: longError,
              fallbackFrom: {
                source: 'heuristic',
                status: 'failed',
                error: longError,
              },
            },
          },
          pageInfo: { width: 1280, height: 720 },
          hashId: 'click-with-long-semantic',
        },
      ],
      testName: 'Replay workflow',
      maxScreenshots: 0,
    });

    const userMessage = prompt[1];
    const text = Array.isArray(userMessage.content)
      ? userMessage.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
      : '';

    expect(text).toContain('"error": "verify failed:');
    expect(text).toContain('[truncated');
    expect(text).not.toContain('"fallbackFrom"');
    expect(text).not.toContain('"source": "heuristic"');
    expect(text.length).toBeLessThan(20_000);
  });

  it('generates raw Markdown replay content', async () => {
    mockCallAIWithStringResponse.mockResolvedValue({
      content:
        '```markdown\n# Replay workflow\n\n## Steps\n1. Open page\n2. Tap on the element described as "content card titled \'daily featured story\' in the main content grid".\n```',
      usage: undefined,
    });

    await expect(
      generateRecorderMarkdownReplay(
        {
          target: {
            platformId: 'web',
            label: 'Web',
            values: { url: 'https://example.com' },
          },
          events: mockEvents,
          testName: 'Replay workflow',
        },
        mockedModelConfig,
      ),
    ).resolves.toBe(
      '# Replay workflow\n\n## Steps\n1. Open page\n2. Tap on the element described as "content card titled \'daily featured story\' in the main content grid".\n',
    );

    expect(mockCallAIWithStringResponse).toHaveBeenCalledWith(
      expect.any(Array),
      mockedModelRuntime,
    );
  });
});
