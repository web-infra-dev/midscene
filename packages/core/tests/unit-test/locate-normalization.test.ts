import { normalizePlanningActionLocateFields } from '@/ai-model/workflows/planning/locate-normalization';
import { getMidsceneLocationSchema } from '@/common';
import type { DeviceAction } from '@/device';
import type { PlanningAction } from '@/types';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const actionSpace: DeviceAction[] = [
  {
    name: 'Tap',
    description: 'Tap the element',
    paramSchema: z.object({
      locate: getMidsceneLocationSchema(),
    }),
    call: async () => undefined,
  },
];

const locateResultContext = {
  preparedSize: {
    width: 100,
    height: 100,
  },
};

describe('normalizePlanningActionLocateFields', () => {
  it('leaves actions unchanged when the planned action is outside the action space', () => {
    const toPixelBbox = vi.fn();
    const actions: PlanningAction[] = [
      {
        type: 'UnknownAction',
        param: {},
      },
    ];

    normalizePlanningActionLocateFields(actions, {
      actionSpace,
      includeLocateInPlanning: true,
      locateResultCodec: {
        promptSpec: { resultKey: 'point' },
        toPixelBbox,
      } as any,
      locateResultContext,
    });

    expect(toPixelBbox).not.toHaveBeenCalled();
    expect(actions).toEqual([
      {
        type: 'UnknownAction',
        param: {},
      },
    ]);
  });

  it('normalizes locate params with the configured locate codec', () => {
    const toPixelBbox = vi.fn(() => [10, 20, 30, 40]);
    const actions: PlanningAction[] = [
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'submit',
            point: [50, 60],
          },
        },
      },
    ];

    normalizePlanningActionLocateFields(actions, {
      actionSpace,
      includeLocateInPlanning: true,
      locateResultCodec: {
        promptSpec: { resultKey: 'point' },
        toPixelBbox,
      } as any,
      locateResultContext,
    });

    expect(toPixelBbox).toHaveBeenCalledWith([50, 60], locateResultContext);
    expect(actions[0].param.locate.locatedPixelBbox).toEqual([10, 20, 30, 40]);
  });

  it('keeps only the prompt in prompt-only planning mode', () => {
    const toPixelBbox = vi.fn();
    const actions: PlanningAction[] = [
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'submit',
            point: [50, 60],
          },
        },
      },
    ];

    normalizePlanningActionLocateFields(actions, {
      actionSpace,
      includeLocateInPlanning: false,
      locateResultCodec: {
        promptSpec: { resultKey: 'point' },
        toPixelBbox,
      } as any,
      locateResultContext,
    });

    expect(toPixelBbox).not.toHaveBeenCalled();
    expect(actions[0].param.locate).toEqual({ prompt: 'submit' });
  });
});
