import type { IModelConfig } from '@midscene/shared/env';
import { createFakeContext } from 'tests/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/service-caller/index', async () => {
  const actual = await vi.importActual<
    typeof import('@/ai-model/service-caller/index')
  >('@/ai-model/service-caller/index');
  return {
    ...actual,
    AIResponseParseError: class AIResponseParseError extends Error {},
    callAI: vi.fn(),
    callAIWithObjectResponse: vi.fn(),
    callAIWithStringResponse: vi.fn(),
  };
});

vi.mock('@midscene/shared/img', async () => {
  const actual = await vi.importActual<typeof import('@midscene/shared/img')>(
    '@midscene/shared/img',
  );
  return {
    ...actual,
    preProcessImageUrl: vi
      .fn()
      .mockResolvedValue('data:image/png;base64,REFERENCE'),
  };
});

import { AiExtractElementInfo } from '@/ai-model/inspect';
import { callAI } from '@/ai-model/service-caller/index';
import { preProcessImageUrl } from '@midscene/shared/img';

describe('AiExtractElementInfo prompt assembly', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'insight',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAI).mockResolvedValue({
      content:
        '<thought>Looks correct.</thought><data-json>{"result":true}</data-json>',
      usage: undefined,
      reasoning_content: undefined,
    } as any);
  });

  it('marks the current screenshot as primary and reference images as supporting context', async () => {
    const context = createFakeContext();

    const result = await AiExtractElementInfo<{ result: boolean }>({
      context,
      dataQuery: {
        StatementIsTruthy:
          'Boolean, based on the current screenshot and its contents if provided, unless the user explicitly asks to compare with reference images, whether the following statement is true: 有点赞按钮',
      },
      multimodalPrompt: {
        images: [
          {
            name: 'like-button',
            url: 'https://example.com/ref.png',
          },
        ],
        convertHttpImage2Base64: true,
      },
      modelConfig,
    });

    expect(result.parseResult.data).toEqual({ result: true });
    expect(preProcessImageUrl).toHaveBeenCalledWith(
      'https://example.com/ref.png',
      true,
    );

    const msgs = vi.mocked(callAI).mock.calls[0]?.[0];
    expect(msgs).toHaveLength(5);
    expect(msgs?.[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining(
        'Base your answer on the current screenshot, and on the contents of it when provided.',
      ),
    });
    expect(msgs?.[1]).toMatchObject({
      role: 'user',
      content: expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining(
            'This is the current screenshot to evaluate.',
          ),
        }),
        expect.objectContaining({
          type: 'image_url',
          image_url: expect.objectContaining({
            url: expect.stringMatching(/^data:image\/png;base64,/),
          }),
        }),
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('<DATA_DEMAND>'),
        }),
      ]),
    });
    expect(msgs?.[2]).toMatchObject({
      role: 'user',
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining(
            'reference images are supporting context only',
          ),
        }),
      ],
    });
    expect(msgs?.[3]).toMatchObject({
      role: 'user',
      content: [
        expect.objectContaining({
          type: 'text',
          text: "this is the reference image named 'like-button'. It is a reference image, not the current screenshot:",
        }),
      ],
    });
    expect(msgs?.[4]).toMatchObject({
      role: 'user',
      content: [
        expect.objectContaining({
          type: 'image_url',
          image_url: expect.objectContaining({
            url: 'data:image/png;base64,REFERENCE',
          }),
        }),
      ],
    });
  });
});
