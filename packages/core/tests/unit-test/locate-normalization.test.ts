import type { ParsedPlanningLocateParameter } from '@/ai-model/model-adapter/planning-protocol';
import { createLocateResultCodec } from '@/ai-model/shared/model-locate-result';
import { normalizePlanningActionLocateFields } from '@/ai-model/workflows/planning/locate-normalization';
import { getMidsceneLocationSchema } from '@/common';
import type { DeviceAction } from '@/device';
import type { PlanningAction } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';
import { z } from 'zod';

const pointCodec = createLocateResultCodec({ coordinates: { shape: 'point' } });
const bboxCodec = createLocateResultCodec({ coordinates: { shape: 'bbox' } });

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

const parseRawLocateParameter = (value: unknown) =>
  value as ParsedPlanningLocateParameter;

describe('normalizePlanningActionLocateFields', () => {
  it('leaves actions unchanged when the planned action is outside the action space', () => {
    const toPixelResult = rs.fn();
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
        ...pointCodec,
        toPixelResult,
      } as any,
      locateResultContext,
      parseRawLocateParameter,
    });

    expect(toPixelResult).not.toHaveBeenCalled();
    expect(actions).toEqual([
      {
        type: 'UnknownAction',
        param: {},
      },
    ]);
  });

  it('normalizes locate params with the configured locate codec', () => {
    const toPixelResult = rs.fn(() => ({ center: [20, 30] }));
    const actions: PlanningAction[] = [
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'submit',
            deepLocate: true,
            cacheable: false,
            xpath: '//button[@type="submit"]',
            point: [50, 60],
          },
        },
      },
    ];

    normalizePlanningActionLocateFields(actions, {
      actionSpace,
      includeLocateInPlanning: true,
      locateResultCodec: {
        ...pointCodec,
        toPixelResult,
      } as any,
      locateResultContext,
      parseRawLocateParameter,
    });

    expect(toPixelResult).toHaveBeenCalledWith([50, 60], locateResultContext);
    expect(actions[0].param.locate).toEqual({
      prompt: 'submit',
      deepLocate: true,
      cacheable: false,
      xpath: '//button[@type="submit"]',
      locatedPixelResult: { center: [20, 30] },
    });
  });

  it('accepts bbox_2d when the model adapter enables the alias', () => {
    const toPixelResult = rs.fn(() => ({
      center: [20, 30],
      rect: { left: 50, top: 60, width: 21, height: 21 },
    }));
    const actions: PlanningAction[] = [
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'submit',
            bbox_2d: [50, 60, 70, 80],
          },
        },
      },
    ];

    normalizePlanningActionLocateFields(actions, {
      actionSpace,
      includeLocateInPlanning: true,
      locateResultCodec: {
        ...bboxCodec,
        toPixelResult,
      } as any,
      locateResultContext,
      acceptBbox2dAlias: true,
      parseRawLocateParameter,
    });

    expect(toPixelResult).toHaveBeenCalledWith(
      [50, 60, 70, 80],
      locateResultContext,
    );
    expect(actions[0].param.locate).toEqual({
      prompt: 'submit',
      locatedPixelResult: {
        center: [20, 30],
        rect: { left: 50, top: 60, width: 21, height: 21 },
      },
    });
  });

  it('parses protocol-specific locate params after identifying locator fields', () => {
    const parseProtocolLocateParameter = rs.fn(() => ({
      prompt: 'submit',
      point: [50, 60],
    }));
    const toPixelResult = rs.fn(() => ({ center: [20, 30] }));
    const actions: PlanningAction[] = [
      {
        type: 'Tap',
        param: {
          locate: '<prompt>submit</prompt><point>50 60</point>',
        },
      },
    ];

    normalizePlanningActionLocateFields(actions, {
      actionSpace,
      includeLocateInPlanning: true,
      locateResultCodec: {
        ...pointCodec,
        toPixelResult,
      } as any,
      locateResultContext,
      parseRawLocateParameter: parseProtocolLocateParameter,
    });

    expect(parseProtocolLocateParameter).toHaveBeenCalledWith(
      '<prompt>submit</prompt><point>50 60</point>',
    );
    expect(toPixelResult).toHaveBeenCalledWith([50, 60], locateResultContext);
    expect(actions[0].param.locate).toEqual({
      prompt: 'submit',
      locatedPixelResult: { center: [20, 30] },
    });
  });

  it('keeps only the prompt in prompt-only planning mode', () => {
    const toPixelResult = rs.fn();
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
        ...pointCodec,
        toPixelResult,
      } as any,
      locateResultContext,
      parseRawLocateParameter,
    });

    expect(toPixelResult).not.toHaveBeenCalled();
    expect(actions[0].param.locate).toEqual({ prompt: 'submit' });
  });
});

it.each(['bbox', 'point'] as const)(
  'parses a %s response once and retains a region only for actual bbox results',
  (shape) => {
    const parseRawLocateValue = rs.fn(() =>
      shape === 'bbox'
        ? {
            coordinates: [10, 20, 31, 41] as [number, number, number, number],
            coordinatesMeta: { shape: 'bbox' as const, order: 'xy' as const },
          }
        : {
            coordinates: [20.5, 30.5] as [number, number],
            coordinatesMeta: { shape: 'point' as const, order: 'xy' as const },
          },
    );
    // A bbox-configured model may still return a native point for this response.
    const codec = createLocateResultCodec({
      coordinates: { shape: 'bbox' },
      parseRawLocateValue,
    });
    const actions: PlanningAction[] = [
      {
        type: 'Tap',
        param: { locate: { prompt: 'target', bbox: 'model response' } },
      },
    ];
    normalizePlanningActionLocateFields(actions, {
      actionSpace,
      includeLocateInPlanning: true,
      locateResultCodec: codec,
      locateResultContext,
      parseRawLocateParameter,
    });
    expect(parseRawLocateValue).toHaveBeenCalledTimes(1);
    expect(actions[0].param.locate.locatedPixelResult.center).toEqual([
      20.5, 30.5,
    ]);
    if (shape === 'bbox') {
      expect(actions[0].param.locate.locatedPixelResult.rect).toEqual({
        left: 10,
        top: 20,
        width: 22,
        height: 22,
      });
    } else {
      expect(actions[0].param.locate.locatedPixelResult.rect).toBeUndefined();
    }
  },
);
