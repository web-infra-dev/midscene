import { buildActionDescription } from '@/ai-model/model-adapter/default-planning-protocol';
import { createLocateResultCodec } from '@/ai-model/shared/model-locate-result';
import { normalizePlanningActionFields } from '@/ai-model/workflows/planning/locate-normalization';
import { parsePlanningActions } from '@/ai-model/workflows/planning/parse-planning-actions';
import { buildYamlFlowFromPlans, parseActionParam } from '@/common';
import {
  ActionPinchParamSchema,
  ActionSwipeParamSchema,
  defineActionScroll,
} from '@/device';
import {
  findDistanceFields,
  getMidsceneDistanceSchema,
} from '@/distance-schema';
import type { DeviceAction, PlanningAction, UIContext } from '@/types';
import { describe, expect, it } from '@rstest/core';
import { z } from 'zod';

const codec = createLocateResultCodec({
  coordinates: { shape: 'point', normalizedBy: 1000, rounding: 'none' },
});
const ActionScrollParamSchema = defineActionScroll(async () => {}).paramSchema!;
const definitions = [
  ['Scroll', ActionScrollParamSchema],
  ['Swipe', ActionSwipeParamSchema],
  ['Pinch', ActionPinchParamSchema],
  [
    'PullGesture',
    z.object({
      direction: z.enum(['up', 'down']),
      distance: getMidsceneDistanceSchema().optional(),
    }),
  ],
] as const;
const actionSpace = definitions.map(([name, paramSchema]) => ({
  name,
  paramSchema,
  call: async () => {},
})) as DeviceAction[];
const options = {
  actionSpace,
  includeLocateInPlanning: false,
  locateResultCodec: codec,
  locateResultContext: { preparedSize: { width: 600, height: 1200 } },
};
const context = {
  shotSize: { width: 600, height: 1200 },
  shrunkShotToLogicalRatio: 1.5,
} as UIContext;

function executeUnits(
  param: Record<string, any>,
  schema: z.ZodTypeAny,
  model: boolean,
  ctx = context,
) {
  return parseActionParam(param, schema, {
    shrunkShotToLogicalRatio: ctx.shrunkShotToLogicalRatio,
    distanceUnit: model ? 'model-input-image-pixel' : 'device-logical',
  })!;
}

describe('distance schema metadata', () => {
  it('survives number refinements, descriptions and optional/nullable/default wrappers', () => {
    const schema = z.object({
      amount: getMidsceneDistanceSchema()
        .positive()
        .describe('distance')
        .nullable()
        .optional()
        .default(20),
      duration: z.number(),
    });
    expect(findDistanceFields(schema)).toEqual(['amount']);
    expect(schema.parse({ duration: 10 }).amount).toBe(20);
    expect(() => schema.parse({ amount: -1, duration: 10 })).toThrow();
    expect(
      parseActionParam({ duration: 10 }, schema, {
        shrunkShotToLogicalRatio: 0.5,
        distanceUnit: 'model-input-image-pixel',
      }),
    ).toEqual({ duration: 10, amount: 20 });
  });
  it('marks all built-in core distance fields', () => {
    for (const [, schema] of definitions) {
      expect(findDistanceFields(schema)).toEqual(['distance']);
    }
  });
});

describe('model distance normalization', () => {
  it.each(['standard', 'custom'])(
    'preserves pixel distances in %s planning',
    (path) => {
      const actions = definitions.map(([type]) => ({
        type,
        param: { distance: 100, direction: type === 'Pinch' ? 'out' : 'up' },
      })) as PlanningAction[];
      if (path === 'standard') {
        parsePlanningActions(actions, {
          ...options,
          parseRawLocateParameter: (value) => value as any,
        });
      } else {
        normalizePlanningActionFields(actions, options);
      }
      expect(actions.map((action) => action.param.distance)).toEqual([
        100, 100, 100, 100,
      ]);
    },
  );
  it('uses metadata rather than action/parameter names and leaves durations untouched', () => {
    const schema = z.object({
      travel: getMidsceneDistanceSchema(),
      duration: z.number(),
    });
    const actions = [
      { type: 'CustomMove', param: { travel: 100, duration: 100 } },
    ];
    normalizePlanningActionFields(actions, {
      ...options,
      actionSpace: [
        { name: 'CustomMove', paramSchema: schema, call: async () => {} },
      ],
    });
    expect(actions[0].param).toEqual({ travel: 100, duration: 100 });
  });
  it('keeps pixel inputs and omitted/null distances unchanged', () => {
    const actions = [
      { type: 'Scroll', param: { distance: 100 } },
      { type: 'Scroll', param: {} },
      { type: 'Scroll', param: { distance: null } },
    ] as PlanningAction[];
    normalizePlanningActionFields(actions, {
      ...options,
      locateResultCodec: createLocateResultCodec({
        coordinates: { shape: 'bbox' },
      }),
    });
    expect(actions.map((action) => action.param.distance)).toEqual([
      100,
      undefined,
      null,
    ]);
  });
  it('describes input-image units on marked planning fields only', () => {
    const paramSchema = z.object({
      travel: getMidsceneDistanceSchema().optional().describe('Travel amount'),
      duration: z.number().describe('Duration in milliseconds'),
    });
    const result = buildActionDescription({
      action: { name: 'Move', paramSchema, call: async () => {} },
      locateFieldDescription: 'locator',
    });
    expect(result.param).toMatchObject({
      travel: {
        description: expect.stringContaining('pixels of the input image'),
      },
      duration: { description: 'Duration in milliseconds' },
    });
    expect(paramSchema.shape.travel.description).toBe('Travel amount');
  });
});

describe('screenshot and device boundaries', () => {
  it('converts positions and distances with the same ratio', () => {
    const param = {
      direction: 'up',
      distance: 120,
      start: { prompt: 'start', center: [60, 120] },
    };
    const device = executeUnits(param, ActionSwipeParamSchema, true);
    expect(device.distance).toBe(80);
    expect(device.start.center).toEqual([40, 80]);
    expect(param.distance).toBe(120);
  });
  it.each([1, 1.5, 2, 3])(
    'keeps explicit API distances and model visual distances invariant at shrink %s',
    (shrink) => {
      const ctx = {
        ...context,
        shotSize: { width: 1200 / shrink, height: 2400 / shrink },
        shrunkShotToLogicalRatio: 3 / shrink,
      };
      for (const [name, schema] of definitions) {
        const direction = name === 'Pinch' ? 'out' : 'up';
        const param = { direction, distance: 100 };
        expect(executeUnits(param, schema, false, ctx).distance).toBe(100);
        const pixelDistance = 240 / shrink;
        expect(
          executeUnits({ ...param, distance: pixelDistance }, schema, true, ctx)
            .distance,
        ).toBeCloseTo(80);
      }
    },
  );
  it('writes device-unit distances to YAML without changing the plan', () => {
    const plans = [
      { type: 'Scroll', param: { direction: 'up', distance: 120 } },
    ];
    expect(
      buildYamlFlowFromPlans(
        plans,
        actionSpace,
        context.shrunkShotToLogicalRatio,
      )[0].distance,
    ).toBe(80);
    expect(plans[0].param.distance).toBe(120);
  });
  it('preserves non-spatial custom schemas at execution', () => {
    expect(
      parseActionParam('text' as any, z.string(), {
        shrunkShotToLogicalRatio: 1.5,
        distanceUnit: 'model-input-image-pixel',
      }),
    ).toBe('text');
    expect(
      parseActionParam(
        { value: '42' },
        z.object({ value: z.string().transform(Number) }),
        {
          shrunkShotToLogicalRatio: 1.5,
          distanceUnit: 'model-input-image-pixel',
        },
      ),
    ).toEqual({ value: 42 });
  });
  it('does not scale a missing distance default', () => {
    const schema = z.object({
      distance: getMidsceneDistanceSchema().default(100),
    });
    expect(executeUnits({}, schema, true)).toEqual({ distance: 100 });
    expect(parseActionParam({}, schema)).toEqual({ distance: 100 });
  });
});
