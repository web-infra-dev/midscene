import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { getModelRuntime } from '@/ai-model/models';
import Service from '@/service';
import { type AIUsageInfo, ServiceError } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../utils';

rs.mock('@/ai-model/workflows/grounding', () => ({
  AIResponseParseError: class AIResponseParseError extends Error {},
  AiExtractElementInfo: rs.fn(),
  AiLocateElement: rs.fn(),
  AiLocateSection: rs.fn(),
  buildSearchAreaConfig: rs.fn(),
}));

import {
  AiLocateElement,
  AiLocateSection,
  buildSearchAreaConfig,
} from '@/ai-model/workflows/grounding';

describe('service.locate deepLocate routing', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
    slot: 'default',
  };
  const modelRuntime = getModelRuntime(modelConfig);

  beforeEach(() => {
    rs.clearAllMocks();

    rs.mocked(AiLocateElement).mockResolvedValue({
      parseResult: {
        element: {
          center: [120, 220],
          rect: { left: 100, top: 200, width: 40, height: 40 },
          description: 'target',
          xpaths: ['/html/body/button[1]'],
          attributes: {},
        } as any,
        errors: [],
      },
      rect: { left: 100, top: 200, width: 40, height: 40 },
      rawResponse: '{}',
      usage: undefined,
      reasoning_content: undefined,
    } as any);

    rs.mocked(AiLocateSection).mockResolvedValue({
      searchAreaConfig: {
        sourceRect: { left: 10, top: 20, width: 300, height: 200 },
        image: {
          imageBase64: 'data:image/png;base64,AAA',
          width: 300,
          height: 200,
        },
        mapping: {
          offset: { x: 10, y: 20 },
          scale: 2,
        },
      },
      rawResponse: '{}',
      usage: undefined,
    });

    rs.mocked(buildSearchAreaConfig).mockResolvedValue({
      sourceRect: { left: 20, top: 30, width: 280, height: 180 },
      image: {
        imageBase64: 'data:image/png;base64,BBB',
        width: 280,
        height: 180,
      },
      mapping: {
        offset: { x: 20, y: 30 },
        scale: 2,
      },
    });
  });

  it('uses planLocatedElement and skips first-pass locate when provided', async () => {
    const service = new Service(createFakeContext());
    const planLocatedElement = {
      center: [150, 250],
      rect: { left: 120, top: 220, width: 60, height: 60 },
      description: 'plan target',
      xpaths: [],
      attributes: {},
    } as any;

    await service.locate(
      { prompt: 'target', deepLocate: true },
      { planLocatedElement },
      modelRuntime,
    );

    expect(buildSearchAreaConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        baseRect: planLocatedElement.rect,
      }),
    );
    expect(AiLocateElement).toHaveBeenCalledTimes(1);
    expect(AiLocateSection).not.toHaveBeenCalled();
  });

  it('uses AiLocateSection to build search area when the model supports it', async () => {
    const service = new Service(createFakeContext());

    await service.locate(
      { prompt: 'target', deepLocate: true },
      {},
      modelRuntime,
    );

    expect(AiLocateSection).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionDescription: 'target',
      }),
    );
    expect(AiLocateElement).toHaveBeenCalledTimes(1);
    expect(buildSearchAreaConfig).not.toHaveBeenCalled();
  });

  it('records search-area model data when section locate fails', async () => {
    const service = new Service(createFakeContext());
    const rawChoiceMessage = {
      content: '{"bbox":["invalid bbox"]}',
      role: 'assistant',
    };
    const usage: AIUsageInfo = {
      prompt_tokens: 12,
      completion_tokens: 6,
      total_tokens: 18,
      cached_input: undefined,
      time_cost: undefined,
      model_name: undefined,
      model_description: undefined,
      response_model_name: undefined,
      intent: undefined,
      slot: undefined,
      request_id: undefined,
    };
    rs.mocked(AiLocateSection).mockResolvedValue({
      searchAreaConfig: undefined,
      error: 'invalid bbox data',
      rawResponse: '{"bbox":["invalid bbox"]}',
      rawChoiceMessage,
      usage,
    });

    const error = await service
      .locate({ prompt: 'target', deepLocate: true }, {}, modelRuntime)
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).message).toBe(
      'cannot find search area for "target": invalid bbox data',
    );
    expect((error as ServiceError).dump).toMatchObject({
      type: 'locate',
      userQuery: { element: 'target' },
      matchedElement: [],
      deepLocate: true,
      error: 'cannot find search area for "target": invalid bbox data',
      taskInfo: {
        searchAreaRawResponse: '{"bbox":["invalid bbox"]}',
        searchAreaRawChoiceMessage: rawChoiceMessage,
        searchAreaUsage: usage,
      },
    });
    expect(AiLocateElement).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: 'a custom locate adapter',
      modelRuntime: getModelRuntime({
        ...modelConfig,
        modelFamily: 'auto-glm',
      }),
    },
    {
      description: 'a standard adapter with search-area locate disabled',
      modelRuntime: {
        ...modelRuntime,
        adapter: new ResolvedModelAdapter(
          {
            locate: { searchArea: false },
          },
          'test-search-area-disabled',
        ),
      },
    },
  ])('uses first-pass locate for $description', async ({ modelRuntime }) => {
    const service = new Service(createFakeContext());

    await service.locate(
      { prompt: 'target', deepLocate: true },
      {},
      modelRuntime,
    );

    expect(AiLocateSection).not.toHaveBeenCalled();
    expect(AiLocateElement).toHaveBeenCalledTimes(2);
    expect(buildSearchAreaConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        baseRect: { left: 100, top: 200, width: 40, height: 40 },
      }),
    );
  });
});
