import { getModelRuntime } from '@/ai-model/models';
import { callAIWithObjectResponse } from '@/ai-model/service-caller/index';
import { AiLocateElement, AiLocateSection } from '@/ai-model/workflows/inspect';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeContext } from '../utils';

vi.mock('@/ai-model/service-caller/index', async () => {
  const actual = await vi.importActual<
    typeof import('@/ai-model/service-caller/index')
  >('@/ai-model/service-caller/index');
  return {
    ...actual,
    callAIWithObjectResponse: vi.fn(),
  };
});

describe('locate not-found parsing', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
    slot: 'default',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps locate errors without parsing coordinates when result key is missing', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: { errors: ['target element is not found'] },
      usage: undefined,
      contentString: '{"errors":["target element is not found"]}',
    });

    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'missing button',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(result.rect).toBeUndefined();
    expect(result.parseResult).toEqual({
      element: undefined,
      errors: ['target element is not found'],
    });
  });

  it('skips coordinate parsing when result key is missing even without errors', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: {},
      usage: undefined,
      contentString: '{}',
    });

    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'missing button',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(result.rect).toBeUndefined();
    expect(result.parseResult).toEqual({
      element: undefined,
      errors: [],
    });
  });

  it('skips coordinate parsing when result key is an empty array', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: { bbox: [], errors: ['target element is not found'] },
      usage: undefined,
      contentString: '{"bbox":[],"errors":["target element is not found"]}',
    });

    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'missing button',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(result.rect).toBeUndefined();
    expect(result.parseResult).toEqual({
      element: undefined,
      errors: ['target element is not found'],
    });
  });

  it('keeps section locate error without parsing coordinates when result key is missing', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: { error: 'target section is not found' },
      usage: undefined,
      contentString: '{"error":"target section is not found"}',
    });

    const result = await AiLocateSection({
      context: createFakeContext(),
      sectionDescription: 'missing section',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(result.searchAreaConfig).toBeUndefined();
    expect(result.error).toBe('target section is not found');
  });

  it('keeps section locate error without parsing coordinates when result key is an empty array', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: { bbox: [], error: 'target section is not found' },
      usage: undefined,
      contentString: '{"bbox":[],"error":"target section is not found"}',
    });

    const result = await AiLocateSection({
      context: createFakeContext(),
      sectionDescription: 'missing section',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(result.searchAreaConfig).toBeUndefined();
    expect(result.error).toBe('target section is not found');
  });
});
