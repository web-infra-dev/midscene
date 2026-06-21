import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { getModelRuntime } from '@/ai-model/models';
import { callAIWithObjectResponse } from '@/ai-model/service-caller/index';
import { AiLocateElement, AiLocateSection } from '@/ai-model/workflows/inspect';
import type { LocateFn } from '@/ai-model/workflows/inspect/types';
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

  it('returns locate parsing errors when result adapter cannot map coordinates', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: {
        bbox: [100, Number.NaN, 300, 400],
        errors: ['model returned invalid coordinates'],
      },
      usage: undefined,
      contentString:
        '{"bbox":[100,null,300,400],"errors":["model returned invalid coordinates"]}',
    });

    const result = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'invalid coordinate target',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(result.rect).toBeUndefined();
    expect(result.parseResult.element).toBeUndefined();
    expect(result.parseResult.errors).toEqual([
      'model returned invalid coordinates',
      expect.stringMatching(
        /Failed to parse locate result: invalid parsed locate result/,
      ),
    ]);
  });

  it('passes locate request context to custom locate and maps its bbox result', async () => {
    const locateFn = vi.fn<LocateFn>().mockResolvedValue({
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
          supportsSearchArea: true,
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
      'custom target',
      expect.any(Object),
      expect.objectContaining({
        elementDescriptionText: 'custom target',
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
