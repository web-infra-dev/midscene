import { getModelRuntime } from '@/ai-model/models';
import { elementDescriberInstruction } from '@/ai-model/prompt/describe';
import { AIResponseParseError } from '@/ai-model/service-caller';
import Service from '@/service';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeContext } from '../utils';

const { mockCallAIWithObjectResponse } = vi.hoisted(() => ({
  mockCallAIWithObjectResponse: vi.fn(),
}));

vi.mock('@/ai-model/service-caller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/ai-model/service-caller')>();
  return {
    ...actual,
    callAIWithObjectResponse: mockCallAIWithObjectResponse,
  };
});

describe('service.describe', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
    slot: 'default',
  };
  const modelRuntime = getModelRuntime(modelConfig);

  beforeEach(() => {
    mockCallAIWithObjectResponse.mockReset();
  });

  it('instructs icon-only controls to include owning stable context', () => {
    const prompt = elementDescriberInstruction();

    expect(prompt).toContain('For icon-only buttons or unlabeled controls');
    expect(prompt).toContain('nearest stable label, section title');
    expect(prompt).toContain('When multiple similar icons or controls appear');
    expect(prompt).toContain('owning stable text or section');
  });

  it('recovers a description response with unescaped quotes in the string value', async () => {
    const rawResponse = `\`\`\`json
{
  "description": "顶部搜索栏中的搜索输入框，placeholder 为"搜索你感兴趣的内容""
}
\`\`\``;
    mockCallAIWithObjectResponse.mockRejectedValueOnce(
      new Error(
        `failed to parse LLM response into JSON. Error - Error: Colon expected at position 59. Response - \n ${rawResponse}`,
      ),
    );

    const service = new Service(createFakeContext());
    const result = await service.describe([100, 100], modelRuntime);

    expect(result).toEqual({
      description:
        '顶部搜索栏中的搜索输入框，placeholder 为"搜索你感兴趣的内容"',
    });
  });

  it('recovers from structured AI response parse errors when rawResponse is available', async () => {
    const rawResponse =
      '{"description": "搜索输入框，placeholder 为"搜索你感兴趣的内容""}';
    mockCallAIWithObjectResponse.mockRejectedValueOnce(
      new AIResponseParseError('failed to parse json response', rawResponse),
    );

    const service = new Service(createFakeContext());
    const result = await service.describe([100, 100], modelRuntime);

    expect(result).toEqual({
      description: '搜索输入框，placeholder 为"搜索你感兴趣的内容"',
    });
  });

  it('keeps non-description parse failures strict', async () => {
    mockCallAIWithObjectResponse.mockRejectedValueOnce(
      new Error(
        'failed to parse LLM response into JSON. Error - Error: invalid. Response - \n {"error": "bad response"}',
      ),
    );

    const service = new Service(createFakeContext());
    await expect(service.describe([100, 100], modelRuntime)).rejects.toThrow(
      'failed to parse LLM response into JSON',
    );
  });
});
