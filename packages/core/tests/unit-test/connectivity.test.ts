import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

// Share one hoisted mock object so the source under test and the test file see
// the same `callAI` spy.
const serviceCallerMock = rs.hoisted(() => ({
  callAI: rs.fn(),
}));
rs.mock('@/ai-model/service-caller/index', () => serviceCallerMock);

rs.mock('@/service', () => ({
  default: rs.fn().mockImplementation(() => ({
    locate: rs.fn(),
  })),
}));

// Use a top-level `importActual` attribute import to keep the real exports of
// `@midscene/shared/img`. rstest does not reliably resolve `rs.importActual()`
// when it is called *inside* an async mock factory (the factory is hoisted above
// imports), so the in-factory form drops every real export and leaves them
// undefined.
import * as imgActual from '@midscene/shared/img' with {
  rstest: 'importActual',
};

rs.mock('@midscene/shared/img', () => ({
  ...imgActual,
  imageInfoOfBase64: rs.fn().mockResolvedValue({ width: 800, height: 450 }),
}));

import { runConnectivityTest } from '@/ai-model/connectivity';
import { callAI } from '@/ai-model/service-caller/index';
import Service from '@/service';
import { imageInfoOfBase64 } from '@midscene/shared/img';

describe('runConnectivityTest', () => {
  const defaultModelConfig: IModelConfig = {
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    modelFamily: 'qwen2.5-vl',
    intent: 'default',
    slot: 'default',
  };
  const planningModelConfig: IModelConfig = {
    modelName: 'test-planning-model',
    modelDescription: 'test-planning-model-desc',
    modelFamily: 'qwen2.5-vl',
    intent: 'planning',
    slot: 'planning',
  };
  const insightModelConfig: IModelConfig = {
    modelName: 'test-insight-model',
    modelDescription: 'test-insight-model-desc',
    modelFamily: 'gpt-5',
    intent: 'insight',
    slot: 'insight',
  };

  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('returns passed when all checks succeed', async () => {
    rs.mocked(callAI)
      .mockResolvedValueOnce({ content: 'CONNECTIVITY_OK' } as any)
      .mockResolvedValueOnce({ content: 'What needs to be done?' } as any);

    const locate = rs.fn().mockResolvedValue({
      rect: { left: 120, top: 90, width: 360, height: 60 },
      element: {
        center: [300, 120],
        rect: { left: 120, top: 90, width: 360, height: 60 },
        description: 'main todo input box',
      },
    });
    rs.mocked(Service).mockImplementation(
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
    expect(result.checks.map((item) => item.intent)).toEqual([
      'planning',
      'insight',
      'default',
    ]);
    expect(result.checks.map((item) => item.modelName)).toEqual([
      'test-planning-model',
      'test-insight-model',
      'test-model',
    ]);
    expect(result.checks.map((item) => item.passed)).toEqual([
      true,
      true,
      true,
    ]);
    expect(locate).toHaveBeenCalledWith(
      { prompt: 'the main todo input box' },
      {},
      expect.objectContaining({
        config: defaultModelConfig,
      }),
    );
    expect(rs.mocked(callAI).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        config: planningModelConfig,
      }),
    );
    expect(rs.mocked(callAI).mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        config: insightModelConfig,
      }),
    );
    expect(rs.mocked(imageInfoOfBase64)).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/png;base64,/),
    );

    const visionCall = rs.mocked(callAI).mock.calls[1]?.[0]?.[0];
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
    rs.mocked(callAI)
      .mockResolvedValueOnce({ content: 'wrong-token' } as any)
      .mockRejectedValueOnce(new Error('vision failed'));

    const locate = rs.fn().mockResolvedValue({
      rect: { left: 10, top: 10, width: 20, height: 20 },
      element: {
        center: [20, Number.NaN],
        rect: { left: 10, top: 10, width: 20, height: 20 },
        description: 'wrong target',
      },
    });
    rs.mocked(Service).mockImplementation(
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
    expect(result.checks).toHaveLength(3);
    expect(result.checks[0]?.passed).toBe(false);
    expect(result.checks[1]?.message).toContain('vision failed');
    expect(result.checks[2]?.passed).toBe(false);
  });
});
