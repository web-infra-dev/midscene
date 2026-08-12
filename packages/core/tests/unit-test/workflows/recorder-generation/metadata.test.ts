import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callAIWithObjectResponse } from '../../../../src/ai-model/service-caller';
import { generateRecorderSessionMetadata } from '../../../../src/ai-model/workflows/recorder-generation/metadata';

vi.mock('../../../../src/ai-model/service-caller', () => ({
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
      contentString:
        '{"title":"Example Recording","description":"The user completed an example workflow."}',
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

  it('samples the complete recording and keeps the final action authoritative', async () => {
    const events = [
      {
        type: 'navigation' as const,
        url: 'https://example.com',
        timestamp: 1,
        hashId: 'navigation-1',
      },
      ...Array.from({ length: 22 }, (_, index) => {
        const batch = index + 1;
        return {
          type: 'click' as const,
          actionType: 'Tap',
          sequence: batch,
          timestamp: batch + 1,
          hashId: `click-${batch}`,
          semantic: {
            source: 'aiDescribe' as const,
            status: 'ready' as const,
            elementDescription: `Approve batch ${batch}`,
          },
        };
      }),
    ];

    await generateRecorderSessionMetadata(
      {
        target: {
          platformId: 'web',
          label: 'Web',
          values: { url: 'https://example.com' },
        },
        events,
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
    const serializedSummary = text.match(
      /Summary:\n([\s\S]*?)\n\nRespond/,
    )?.[1];
    expect(serializedSummary).toBeTruthy();
    const summary = JSON.parse(serializedSummary!);

    expect(summary).toMatchObject({
      totalEvents: 23,
      userActionCount: 22,
      clickCount: 22,
      actionSequence: { first: 1, last: 22, uniqueCount: 22 },
      lastUserAction: {
        eventIndex: 23,
        sequence: 22,
        description: 'Approve batch 22',
      },
      eventSelection: {
        maxEvents: 20,
        omittedEventCount: 3,
      },
    });
    expect(summary.events).toHaveLength(20);
    expect(summary.events.at(-1)).toMatchObject({
      eventIndex: 23,
      sequence: 22,
      description: 'Approve batch 22',
    });
  });
});
