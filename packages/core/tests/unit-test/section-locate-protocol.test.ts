import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { callAI } from '@/ai-model/service-caller/index';
import { AiLocateSection } from '@/ai-model/workflows/grounding';
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

describe('section locate protocol', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
    slot: 'default',
    retryCount: 0,
  };

  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(callAI).mockResolvedValue({
      content: 'custom section response',
      isStreamed: false,
    });
  });

  it('uses the search-area protocol to build and parse the model call', async () => {
    const buildResponseInstructions = rs.fn(
      () => 'Custom search-area response instructions',
    );
    const buildUserPrompt = rs.fn(
      (description: string) => `Custom search-area task: ${description}`,
    );
    const parseRawResponse = rs.fn(() => ({
      kind: 'located' as const,
      target: [100, 200, 300, 400],
    }));
    const adapter = new ResolvedModelAdapter(
      {
        locate: {
          element: {
            resultFormat: {
              coordinates: { shape: 'point', normalizedBy: 1000 },
            },
          },
          searchArea: {
            resultFormat: {
              coordinates: { shape: 'bbox', normalizedBy: 1000 },
            },
            protocol: {
              systemPromptIntroduction: 'Custom search-area introduction',
              buildResponseInstructions,
              buildUserPrompt,
              expectedJsonObjectResponse: false,
              parseRawResponse,
            },
          },
        },
      },
      'test-search-area-protocol',
    );
    if (adapter.locate.kind !== 'standard') {
      throw new Error('test adapter should use standard locate');
    }

    const result = await AiLocateSection({
      context: createFakeContext(),
      sectionDescription: 'the row containing Peter',
      modelRuntime: {
        config: modelConfig,
        adapter,
      },
    });

    expect(buildResponseInstructions).toHaveBeenCalledWith(
      adapter.locate.searchArea?.resultCodec?.promptSpec,
    );
    expect(buildUserPrompt).toHaveBeenCalledWith('the row containing Peter');
    expect(parseRawResponse).toHaveBeenCalledWith(
      'custom section response',
      adapter.locate.searchArea?.resultCodec.promptSpec,
    );
    expect(rs.mocked(callAI).mock.calls[0][0][0]).toMatchObject({
      content: expect.stringContaining('Custom search-area introduction'),
    });
    expect(callAI).toHaveBeenCalledWith(
      [
        {
          role: 'system',
          content: expect.stringContaining(
            'Custom search-area response instructions',
          ),
        },
        {
          role: 'user',
          content: [
            expect.objectContaining({ type: 'image_url' }),
            {
              type: 'text',
              text: 'Custom search-area task: the row containing Peter',
            },
          ],
        },
      ],
      expect.objectContaining({ adapter }),
      expect.objectContaining({
        expectedJsonObjectResponse: false,
      }),
    );
    expect(result.searchAreaConfig).toBeDefined();
  });
  it.each([
    {
      name: 'wide bbox and point reference',
      target: [200, 200, 1199, 299],
      references: [[1500.25, 400.75]],
      sourceRect: { left: 100, top: 100, width: 1501, height: 402 },
    },
    {
      name: 'point target and tall bbox reference',
      target: [0.25, 0.5],
      references: [[400, 100, 499, 849]],
      sourceRect: { left: 0, top: 0, width: 600, height: 950 },
    },
    {
      name: 'point-only target',
      target: [500.25, 500.75],
      references: [],
      sourceRect: { left: 301, top: 302, width: 400, height: 400 },
    },
  ])(
    'merges $name through the unified codec result',
    async ({ target, references, sourceRect }) => {
      const parseRawLocateValue = rs.fn((raw: unknown) => {
        const values = raw as number[];
        return values.length === 4
          ? {
              coordinates: values as [number, number, number, number],
              coordinatesMeta: {
                shape: 'bbox' as const,
                order: 'xy' as const,
                rounding: 'round' as const,
              },
            }
          : {
              coordinates: values as [number, number],
              coordinatesMeta: {
                shape: 'point' as const,
                order: 'xy' as const,
                rounding: 'round' as const,
              },
            };
      });
      const adapter = new ResolvedModelAdapter(
        {
          locate: {
            searchArea: {
              resultFormat: {
                coordinates: { shape: 'bbox' },
                parseRawLocateValue,
              },
              protocol: {
                systemPromptIntroduction: 'Locate the search area',
                buildResponseInstructions: () => 'Return target and references',
                buildUserPrompt: (description: string) => description,
                expectedJsonObjectResponse: false,
                parseRawResponse: () => ({
                  kind: 'located',
                  target,
                  references,
                }),
              },
            },
          },
        },
        'mixed-search-regions',
      );
      const result = await AiLocateSection({
        context: createFakeContext(),
        sectionDescription: 'target with reference',
        modelRuntime: { config: modelConfig, adapter },
      });
      expect(result.error).toBeUndefined();
      expect(result.searchAreaConfig?.sourceRect).toEqual(sourceRect);
      expect(parseRawLocateValue).toHaveBeenCalledTimes(1 + references.length);
    },
  );
});
