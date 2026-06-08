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
    elementDescription: 'Login button',
    screenshotWithBox: screenshot,
    pageInfo: { width: 1280, height: 720 },
    hashId: 'click-1',
  },
];

describe('markdown-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a runMarkdown-focused prompt with platform and screenshot path rules', () => {
    const prompt = createRecorderMarkdownReplayPrompt({
      target: {
        platformId: 'android',
        label: 'emulator-5554',
        values: { deviceId: 'emulator-5554' },
      },
      events: mockEvents,
      testName: 'Replay login',
      language: 'Chinese',
    });

    const userMessage = prompt[1];
    const text = Array.isArray(userMessage.content)
      ? userMessage.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
      : '';

    expect(text).toContain("await agent.runMarkdown('./x.md')");
    expect(text).toContain('Preserve this exact platform: android');
    expect(text).toContain('Do not invent alternative navigation paths.');
    expect(text).toContain(
      'Do not skip, merge, reorder, or add extra user actions.',
    );
    expect(text).toContain('Only reference paths listed in screenshotAssets.');
    expect(text).toContain(
      'Write all human-readable Markdown instructions in Chinese.',
    );
    expect(text).toContain('./screenshots/event-001-navigation.png');
  });

  it('generates raw Markdown replay content', async () => {
    mockCallAIWithStringResponse.mockResolvedValue({
      content: '```markdown\n# Replay login\n\n## Steps\n1. Open page\n```',
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
          testName: 'Replay login',
        },
        mockedModelConfig,
      ),
    ).resolves.toBe('# Replay login\n\n## Steps\n1. Open page\n');

    expect(mockCallAIWithStringResponse).toHaveBeenCalledWith(
      expect.any(Array),
      mockedModelRuntime,
    );
  });
});
