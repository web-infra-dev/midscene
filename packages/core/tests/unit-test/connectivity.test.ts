import type { IModelConfig } from '@midscene/shared/env';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/service-caller/index', () => ({
  callAI: vi.fn(),
}));

vi.mock('@/service', () => ({
  default: vi.fn().mockImplementation(() => ({
    locate: vi.fn(),
  })),
}));

import { runConnectivityTest } from '@/ai-model/connectivity';
import {
  CONNECTIVITY_FIXTURE_IMAGE,
  CONNECTIVITY_FIXTURE_SHOT_SIZE,
} from '@/ai-model/connectivity/fixture';
import { callAI } from '@/ai-model/service-caller/index';
import Service from '@/service';

async function readImageSizeFromDataUrl(dataUrl: string): Promise<{
  width: number;
  height: number;
}> {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const metadata = await sharp(Buffer.from(base64, 'base64')).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
}

describe('runConnectivityTest', () => {
  const defaultModelConfig: IModelConfig = {
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    modelFamily: 'qwen2.5-vl',
    intent: 'default',
    slot: 'default',
    retryCount: 3,
  };
  const planningModelConfig: IModelConfig = {
    modelName: 'test-planning-model',
    modelDescription: 'test-planning-model-desc',
    modelFamily: 'qwen2.5-vl',
    intent: 'planning',
    slot: 'planning',
    retryCount: 3,
  };
  const insightModelConfig: IModelConfig = {
    modelName: 'test-insight-model',
    modelDescription: 'test-insight-model-desc',
    modelFamily: 'gpt-5',
    intent: 'insight',
    slot: 'insight',
    retryCount: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the fixture shot size aligned with the embedded PNG', async () => {
    await expect(
      readImageSizeFromDataUrl(CONNECTIVITY_FIXTURE_IMAGE),
    ).resolves.toEqual(CONNECTIVITY_FIXTURE_SHOT_SIZE);
  });

  it('returns passed when all checks succeed', async () => {
    vi.mocked(callAI)
      .mockResolvedValueOnce({ content: 'CONNECTIVITY_OK' } as any)
      .mockResolvedValueOnce({ content: 'What needs to be done?' } as any);

    const locate = vi.fn().mockResolvedValue({
      rect: { left: 120, top: 90, width: 360, height: 60 },
      element: {
        center: [300, 120],
        rect: { left: 120, top: 90, width: 360, height: 60 },
        description: 'main todo input box',
      },
    });
    vi.mocked(Service).mockImplementation(
      () =>
        ({
          locate,
        }) as any,
    );

    const result = await runConnectivityTest({
      defaultModelConfig,
      planningModelConfig,
      insightModelConfig,
    });

    expect(result.passed).toBe(true);
    expect(result.message).toBeUndefined();
    expect(locate).toHaveBeenCalledWith(
      { prompt: 'the main todo input box' },
      {},
      expect.objectContaining({
        config: expect.objectContaining({
          ...defaultModelConfig,
          retryCount: 0,
        }),
      }),
    );
    expect(vi.mocked(callAI).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          ...planningModelConfig,
          retryCount: 0,
        }),
      }),
    );
    expect(vi.mocked(callAI).mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          ...insightModelConfig,
          retryCount: 0,
        }),
      }),
    );
    expect(defaultModelConfig.retryCount).toBe(3);
    expect(planningModelConfig.retryCount).toBe(3);
    expect(insightModelConfig.retryCount).toBe(3);
    const visionCall = vi.mocked(callAI).mock.calls[1]?.[0]?.[0];
    expect(visionCall).toMatchObject({
      role: 'user',
      content: expect.arrayContaining([
        expect.objectContaining({
          type: 'image_url',
          image_url: expect.objectContaining({
            url: expect.stringMatching(/^data:image\/png;base64,/),
          }),
        }),
      ]),
    });
  });

  it('marks individual failures without throwing', async () => {
    vi.mocked(callAI)
      .mockResolvedValueOnce({ content: 'wrong-token' } as any)
      .mockRejectedValueOnce(new Error('vision failed'));

    const locate = vi.fn().mockResolvedValue({
      rect: { left: 10, top: 10, width: 20, height: 20 },
      element: {
        center: [20, Number.NaN],
        rect: { left: 10, top: 10, width: 20, height: 20 },
        description: 'wrong target',
      },
    });
    vi.mocked(Service).mockImplementation(
      () =>
        ({
          locate,
        }) as any,
    );

    const result = await runConnectivityTest({
      defaultModelConfig,
      planningModelConfig,
      insightModelConfig,
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain(
      '[Text check - test-planning-model (planning)]: Unexpected response: wrong-token',
    );
    expect(result.message).toContain(
      '[Vision check - test-insight-model (insight)]: vision failed',
    );
    expect(result.message).toContain(
      '[AI locate check - test-model (default)]: Invalid locate result:',
    );
  });
});
