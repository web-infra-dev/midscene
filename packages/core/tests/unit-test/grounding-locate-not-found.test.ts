import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller/index';
import {
  AiLocateElement,
  AiLocateSection,
} from '@/ai-model/workflows/grounding';
import type { LocateFn } from '@/ai-model/workflows/grounding/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../utils';

import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};

rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  callAI: rs.fn(),
}));

describe('grounding locate not-found parsing', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
    slot: 'default',
    retryCount: 1,
    retryInterval: 2000,
  };

  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(callAI).mockResolvedValue({ content: '{}', isStreamed: false });
  });

  it.each([
    '{}',
    '{"error":"target element is not found"}',
    '```json\n[{"bbox_1":920,"ymin":73,"xmax":964,"ymax":98}]\n```',
  ])('retries a response missing the coordinate field: %s', async (content) => {
    rs.mocked(callAI)
      .mockResolvedValueOnce({ content, isStreamed: false })
      .mockResolvedValueOnce({
        content: '{"bbox":[100,200,300,400]}',
        isStreamed: false,
      });

    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'top-right menu button',
      modelRuntime: getModelRuntime({ ...modelConfig, modelFamily: 'qwen3' }),
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(rs.mocked(callAI).mock.calls.map((call) => call[2])).toEqual([
      expect.objectContaining({ semanticRetryAttempt: 0 }),
      expect.objectContaining({ semanticRetryAttempt: 1 }),
    ]);
    const retryFeedback = rs.mocked(callAI).mock.calls[1][0].at(-1);
    expect(retryFeedback?.content).toContain(
      'Missing required coordinate field "bbox"',
    );
    expect(retryFeedback?.content).toContain('Expected "bbox":');
    expect(result.rect).toBeDefined();
    expect(result.parseResult.errors).toEqual([]);
  });

  it('preserves the missing-field error and response after retries are exhausted', async () => {
    const content = '{"error":"target element is not found"}';
    rs.mocked(callAI).mockResolvedValue({ content, isStreamed: false });

    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'missing button',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(result.rect).toBeUndefined();
    expect(result.parseResult.errors?.[0]).toContain(
      'Missing required coordinate field "bbox"',
    );
    expect(result.parseResult.errors?.[0]).toContain(
      'target element is not found',
    );
    expect(result.rawResponse).toBe(content);
  });

  it('skips coordinate parsing when result key is an empty array', async () => {
    rs.mocked(callAI).mockResolvedValue({
      content: '{"bbox":[],"error":"target element is not found"}',
      isStreamed: false,
    });

    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'missing button',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(callAI).toHaveBeenCalledTimes(1);
    expect(result.rect).toBeUndefined();
    expect(result.parseResult).toEqual({
      element: undefined,
      errors: ['target element is not found'],
    });
  });

  it('retries once when result codec cannot map coordinates', async () => {
    rs.mocked(callAI)
      .mockResolvedValueOnce({
        content:
          '{"bbox":[100,null,300,400],"error":"model returned invalid coordinates"}',
        isStreamed: false,
      })
      .mockResolvedValueOnce({
        content: '{"bbox":[100,200,300,400]}',
        isStreamed: false,
      });

    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'invalid coordinate target',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(rs.mocked(callAI).mock.calls.map((call) => call[2])).toEqual([
      expect.objectContaining({ semanticRetryAttempt: 0 }),
      expect.objectContaining({ semanticRetryAttempt: 1 }),
    ]);
    const retryFeedback = rs.mocked(callAI).mock.calls[1][0].at(-1);
    expect(retryFeedback).toMatchObject({ role: 'user' });
    expect(retryFeedback?.content).toEqual(
      expect.stringContaining('coordinate parsing error'),
    );
    expect(result.rect).toBeDefined();
    expect(result.parseResult.errors).toEqual([]);
  });

  it('includes model errors when coordinate parsing ultimately fails', async () => {
    rs.mocked(callAI).mockResolvedValue({
      content:
        '{"bbox":[100,null,300,400],"error":"model returned invalid coordinates"}',
      isStreamed: false,
    });

    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'invalid coordinate target',
      modelRuntime: getModelRuntime({ ...modelConfig, retryCount: 0 }),
    });

    expect(result.rect).toBeUndefined();
    expect(result.parseResult.errors?.[0]).toContain(
      'model returned invalid coordinates',
    );
    expect(result.parseResult.errors?.[0]).toContain(
      'modelName=test-model modelFamily=qwen2.5-vl',
    );
  });

  it('retries JSON parsing through the same locate retry loop', async () => {
    rs.mocked(callAI)
      .mockResolvedValueOnce({
        content: '```',
        isStreamed: false,
      })
      .mockResolvedValueOnce({
        content: '{"bbox":[100,200,300,400]}',
        isStreamed: false,
      });

    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'target with malformed JSON',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(result.rect).toBeDefined();
    expect(callAI).toHaveBeenCalledTimes(2);
  });

  it('retries once when search-area result codec cannot map coordinates', async () => {
    rs.mocked(callAI)
      .mockResolvedValueOnce({
        content: '{"bbox":[100,null,300,400]}',
        isStreamed: false,
      })
      .mockResolvedValueOnce({
        content: '{"bbox":[100,200,300,400]}',
        isStreamed: false,
      });

    const result = await AiLocateSection({
      context: createFakeContext(),
      sectionDescription: 'invalid coordinate section',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    const retryFeedback = rs.mocked(callAI).mock.calls[1][0].at(-1);
    expect(retryFeedback).toMatchObject({ role: 'user' });
    expect(retryFeedback?.content).toEqual(
      expect.stringContaining('coordinate parsing error'),
    );
    expect(result.searchAreaConfig).toBeDefined();
  });

  it('passes locate request context to custom locate and maps its bbox result', async () => {
    const locateFn = rs.fn<LocateFn>().mockResolvedValue({
      locatedPixelBbox: [100, 50, 130, 70],
      rawResponse: 'custom locate response',
      usage: { total_tokens: 12 } as any,
      reasoningContent: 'custom reasoning',
    });
    const customAdapter = new ResolvedModelAdapter(
      {
        locate: {
          kind: 'custom',
          locateFn,
        },
      },
      'test-custom-locate',
    );
    const context = createFakeContext();

    const result = await AiLocateElement({
      context,
      targetElementDescription: 'custom target',
      modelRuntime: {
        config: {
          ...modelConfig,
          modelFamily: 'test-custom-locate' as any,
        },
        adapter: customAdapter,
      },
      searchConfig: {
        sourceRect: {
          left: 200,
          top: 100,
          width: 300,
          height: 200,
        },
        image: {
          imageBase64: 'data:image/png;base64,CROP==',
          width: 300,
          height: 200,
        },
        mapping: {
          offset: {
            x: 200,
            y: 100,
          },
          scale: 1,
        },
      },
    });

    expect(locateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        targetElementDescription: 'custom target',
        locateImage: {
          imageBase64: 'data:image/png;base64,CROP==',
          width: 300,
          height: 200,
        },
        options: expect.any(Object),
      }),
    );
    expect(result.rect).toEqual({
      left: 300,
      top: 150,
      width: 31,
      height: 21,
    });
    expect(result.parseResult.errors).toEqual([]);
    expect(result.rawResponse).toBe('custom locate response');
    expect(result.usage).toEqual({ total_tokens: 12 });
    expect(result.reasoning_content).toBe('custom reasoning');
  });

  it('retries a search-area response missing the coordinate field', async () => {
    rs.mocked(callAI)
      .mockResolvedValueOnce({
        content: '{"error":"target section is not found"}',
        isStreamed: false,
      })
      .mockResolvedValueOnce({
        content: '{"bbox":[100,200,300,400]}',
        isStreamed: false,
      });

    const result = await AiLocateSection({
      context: createFakeContext(),
      sectionDescription: 'target section',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    const retryFeedback = rs.mocked(callAI).mock.calls[1][0].at(-1);
    expect(retryFeedback?.content).toContain(
      'Missing required coordinate field "bbox"',
    );
    expect(result.searchAreaConfig).toBeDefined();
  });

  it('keeps section locate error without parsing coordinates when result key is an empty array', async () => {
    rs.mocked(callAI).mockResolvedValue({
      content: '{"bbox":[],"error":"target section is not found"}',
      isStreamed: false,
    });

    const result = await AiLocateSection({
      context: createFakeContext(),
      sectionDescription: 'missing section',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(callAI).toHaveBeenCalledTimes(1);
    expect(result.searchAreaConfig).toBeUndefined();
    expect(result.error).toBe('target section is not found');
  });
});
