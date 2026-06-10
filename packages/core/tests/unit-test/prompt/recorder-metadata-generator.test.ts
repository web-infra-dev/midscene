import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRecorderSessionMetadata } from '../../../src/ai-model/prompt/recorder-metadata-generator';
import { callAIWithObjectResponse } from '../../../src/ai-model/service-caller';

vi.mock('../../../src/ai-model/service-caller', () => ({
  callAIWithObjectResponse: vi.fn(),
}));

const mockCallAIWithObjectResponse = vi.mocked(callAIWithObjectResponse);

const mockedModelConfig = {
  modelName: 'mock',
  modelDescription: 'mock',
  intent: 'default',
  slot: 'default',
} as const satisfies IModelConfig;

describe('recorder-metadata-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCallAIWithObjectResponse.mockResolvedValue({
      content: {
        title: 'Example Recording',
        description: 'The user completed an example workflow.',
      },
      usage: undefined,
    });
  });

  it('omits fallback audit chains before building metadata prompts', async () => {
    const longError = `verify failed: ${'x'.repeat(5000)}`;

    await generateRecorderSessionMetadata(
      {
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
        maxScreenshots: 0,
      },
      mockedModelConfig,
    );

    const prompt = mockCallAIWithObjectResponse.mock.calls[0][0];
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
    expect(text.length).toBeLessThan(10_000);
  });
});
