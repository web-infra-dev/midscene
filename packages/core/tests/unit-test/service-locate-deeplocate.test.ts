import { getModelRuntime } from '@/ai-model/models';
import Service from '@/service';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeContext } from '../utils';

vi.mock('@/ai-model/inspect', () => ({
  AIResponseParseError: class AIResponseParseError extends Error {},
  AiExtractElementInfo: vi.fn(),
  AiLocateElement: vi.fn(),
  AiLocateSection: vi.fn(),
  buildSearchAreaConfig: vi.fn(),
}));

import {
  AiLocateElement,
  AiLocateSection,
  buildSearchAreaConfig,
} from '@/ai-model/inspect';

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
    vi.clearAllMocks();

    vi.mocked(AiLocateElement).mockResolvedValue({
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

    vi.mocked(AiLocateSection).mockResolvedValue({
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

    vi.mocked(buildSearchAreaConfig).mockResolvedValue({
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

  it('uses first-pass locate when the model does not support search-area locate', async () => {
    const service = new Service(createFakeContext());

    await service.locate(
      { prompt: 'target', deepLocate: true },
      {},
      getModelRuntime({
        ...modelConfig,
        modelFamily: 'auto-glm',
      }),
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
