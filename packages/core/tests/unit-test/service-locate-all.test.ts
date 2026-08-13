import { getModelRuntime } from '@/ai-model/models';
import Service from '@/service';
import { ServiceError } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeContext } from '../utils';

vi.mock('@/ai-model/inspect', () => ({
  AIResponseParseError: class AIResponseParseError extends Error {},
  AiExtractElementInfo: vi.fn(),
  AiLocateElement: vi.fn(),
  AiLocateAllElements: vi.fn(),
  AiLocateSection: vi.fn(),
  buildSearchAreaConfig: vi.fn(),
}));

import { AiLocateAllElements } from '@/ai-model/inspect';

describe('service.locateAll', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
    slot: 'default',
  };
  const modelRuntime = getModelRuntime(modelConfig);
  const element = {
    center: [120, 220],
    rect: { left: 100, top: 200, width: 40, height: 40 },
    description: 'target',
    xpaths: [],
    attributes: {},
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all located elements and records service dump details', async () => {
    vi.mocked(AiLocateAllElements).mockResolvedValue({
      parseResult: {
        elements: [element],
        errors: ['partial parse warning'],
      },
      rawResponse: '{"elements":[]}',
      rawChoiceMessage: { role: 'assistant' },
      usage: { total_tokens: 12 } as any,
      reasoning_content: 'batch reasoning',
    });

    const service = new Service(createFakeContext());
    const result = await service.locateAll(
      { prompt: 'target buttons' },
      {},
      modelRuntime,
    );

    expect(AiLocateAllElements).toHaveBeenCalledWith(
      expect.objectContaining({
        targetElementDescription: 'target buttons',
        modelRuntime,
      }),
    );
    expect(result.elements).toEqual([element]);
    expect(result.dump.matchedElement).toEqual([element]);
    expect(result.dump.error).toContain('partial parse warning');
    expect(result.dump.taskInfo.rawChoiceMessage).toEqual({
      role: 'assistant',
    });
    expect(result.dump.taskInfo.reasoning_content).toBe('batch reasoning');
  });

  it('throws ServiceError with dump for fatal locate-all failures', async () => {
    vi.mocked(AiLocateAllElements).mockResolvedValue({
      parseResult: {
        elements: [],
        errors: ['AI call error: bad response'],
        fatalError: true,
      },
      rawResponse: 'bad response',
    });

    const service = new Service(createFakeContext());

    await expect(
      service.locateAll({ prompt: 'target buttons' }, {}, modelRuntime),
    ).rejects.toThrow(ServiceError);
  });
});
