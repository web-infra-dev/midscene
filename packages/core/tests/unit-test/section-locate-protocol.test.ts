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
});
