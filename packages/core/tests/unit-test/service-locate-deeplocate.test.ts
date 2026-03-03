import Service from '@/service';
import type { IModelConfig } from '@midscene/shared/env';
import { createFakeContext } from 'tests/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/index', () => ({
  AIResponseParseError: class AIResponseParseError extends Error {},
  AiExtractElementInfo: vi.fn(),
  AiLocateElement: vi.fn(),
  callAIWithObjectResponse: vi.fn(),
}));

vi.mock('@/ai-model/inspect', () => ({
  AiLocateSection: vi.fn(),
  buildSearchAreaConfig: vi.fn(),
}));

import { AiLocateElement } from '@/ai-model/index';
import { AiLocateSection, buildSearchAreaConfig } from '@/ai-model/inspect';

describe('service.locate deepLocate routing', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(AiLocateElement).mockResolvedValue({
      parseResult: {
        elements: [
          {
            center: [120, 220],
            rect: { left: 100, top: 200, width: 40, height: 40 },
            description: 'target',
            xpaths: ['/html/body/button[1]'],
            attributes: {},
          },
        ] as any,
        errors: [],
      },
      rect: { left: 100, top: 200, width: 40, height: 40 },
      rawResponse: '{}',
      usage: undefined,
      reasoning_content: undefined,
    } as any);

    vi.mocked(AiLocateSection).mockResolvedValue({
      rect: { left: 10, top: 20, width: 300, height: 200 },
      imageBase64: 'data:image/png;base64,AAA',
      scale: 2,
      rawResponse: '{}',
      usage: undefined,
    });

    vi.mocked(buildSearchAreaConfig).mockResolvedValue({
      rect: { left: 20, top: 30, width: 280, height: 180 },
      imageBase64: 'data:image/png;base64,BBB',
      scale: 2,
    });
  });

  it('uses planLocatedElement and skips AiLocateSection when provided', async () => {
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
      modelConfig,
    );

    expect(buildSearchAreaConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        baseRect: planLocatedElement.rect,
      }),
    );
    expect(AiLocateSection).not.toHaveBeenCalled();
  });

  it('falls back to AiLocateSection when planLocatedElement is missing', async () => {
    const service = new Service(createFakeContext());

    await service.locate(
      { prompt: 'target', deepLocate: true },
      {},
      modelConfig,
    );

    expect(AiLocateSection).toHaveBeenCalled();
    expect(buildSearchAreaConfig).not.toHaveBeenCalled();
  });
});
