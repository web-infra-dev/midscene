import type { ModelRuntime } from '@/ai-model/model-adapter/types';
import { getModelRuntime } from '@/ai-model/models';
import { type callAI, parseAIObjectResponse } from '@/ai-model/service-caller';
import type { IModelConfig } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

const modelConfig: IModelConfig = {
  modelName: 'gpt-5',
  modelDescription: 'test',
  openaiApiKey: 'test-key',
  openaiBaseURL: 'https://example.com/v1',
  intent: 'default',
  slot: 'default',
};

const modelResponse = (content: string) =>
  ({
    content,
  }) as Awaited<ReturnType<typeof callAI>>;

describe('parseAIObjectResponse', () => {
  it('rejects a top-level JSON array', () => {
    expect(() =>
      parseAIObjectResponse(
        modelResponse('[1,2]'),
        getModelRuntime(modelConfig),
      ),
    ).toThrow(
      'LLM response is valid JSON but does not match the expected schema',
    );
  });

  it('requires the adapter JSON parser to return an object', () => {
    const modelRuntime = getModelRuntime(modelConfig);
    const jsonParser = vi.fn(() => ({ answer: 42 }));
    const objectResponseModelRuntime: ModelRuntime = {
      ...modelRuntime,
      adapter: {
        ...modelRuntime.adapter,
        jsonParser,
      },
    };

    expect(
      parseAIObjectResponse<{ answer: number }>(
        modelResponse('{"answer":42}'),
        objectResponseModelRuntime,
      ).content,
    ).toEqual({ answer: 42 });
    expect(jsonParser).toHaveBeenCalledWith('{"answer":42}', {
      source: 'generic-object',
    });
  });

  it('rejects an array returned by a custom JSON parser', () => {
    const modelRuntime = getModelRuntime(modelConfig);
    const objectResponseModelRuntime: ModelRuntime = {
      ...modelRuntime,
      adapter: {
        ...modelRuntime.adapter,
        jsonParser: vi.fn(() => [{ answer: 42 }]),
      },
    };

    expect(() =>
      parseAIObjectResponse(
        modelResponse('[{"answer":42}]'),
        objectResponseModelRuntime,
      ),
    ).toThrow('Expected to be a JSON object, got array');
  });
});
