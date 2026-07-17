import { getModelRuntime } from '@/ai-model/models';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../utils';

// Stub only the exports `inspect.ts` imports, sharing one hoisted mock object so
// the source under test and the test file see the same spies.
import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};

const serviceCallerMock = rs.hoisted(() => ({
  callAI: rs.fn(),
  callAIWithObjectResponse: rs.fn(),
}));
rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  ...serviceCallerMock,
}));

import * as imgActual from '@midscene/shared/img' with {
  rstest: 'importActual',
};

rs.mock('@midscene/shared/img', () => ({
  ...imgActual,
  preProcessImageUrl: rs
    .fn()
    .mockResolvedValue('data:image/png;base64,REFERENCE'),
}));

import { callAI } from '@/ai-model/service-caller/index';
import { AiExtractElementInfo } from '@/ai-model/workflows/inspect';
import { preProcessImageUrl } from '@midscene/shared/img';

describe('AiExtractElementInfo prompt assembly', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'insight',
    slot: 'insight',
    retryCount: 1,
    retryInterval: 2000,
  };

  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(callAI).mockResolvedValue({
      content:
        '<observation>Looks correct.</observation><data-json>{"result":true}</data-json>',
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
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(result.parseResult.data).toEqual({ result: true });
    expect(preProcessImageUrl).toHaveBeenCalledWith(
      'https://example.com/ref.png',
      true,
    );

    const msgs = rs.mocked(callAI).mock.calls[0]?.[0];
    expect(msgs).toHaveLength(5);
    expect(msgs?.[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining(
        'The user will provide a current screenshot to evaluate, and may provide its contents.',
      ),
    });
    expect(msgs?.[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining(
        'Reference images are supporting context only unless <DATA_DEMAND> explicitly asks for comparison, matching, or reasoning about them.',
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

  it('passes abortSignal to the AI caller', async () => {
    const abortController = new AbortController();

    await AiExtractElementInfo<{ result: boolean }>({
      context: createFakeContext(),
      dataQuery: {
        StatementIsTruthy: 'Boolean, whether the success toast is visible',
      },
      modelRuntime: getModelRuntime(modelConfig),
      abortSignal: abortController.signal,
    });

    expect(rs.mocked(callAI).mock.calls[0]?.[2]).toEqual({
      abortSignal: abortController.signal,
    });
  });

  it('retries once when the insight XML response cannot be parsed', async () => {
    rs.mocked(callAI)
      .mockResolvedValueOnce({
        content: '<observation>Looks correct.</observation>',
        usage: undefined,
        reasoning_content: undefined,
      } as any)
      .mockResolvedValueOnce({
        content:
          '<observation>Looks correct.</observation><data-json>{"result":true}</data-json>',
        usage: undefined,
        reasoning_content: undefined,
      } as any);

    const result = await AiExtractElementInfo<{ result: boolean }>({
      context: createFakeContext(),
      dataQuery: {
        StatementIsTruthy: 'Boolean, whether the success toast is visible',
      },
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(result.parseResult.data).toEqual({ result: true });
  });
});
