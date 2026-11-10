import type { ParsedPlanningLocateParameter } from '@/ai-model/model-adapter/planning-protocol';
import { parsePlanningActions } from '@/ai-model/workflows/planning/parse-planning-actions';
import {
  getMidsceneLocationSchema,
  parseActionParam,
  validateRequiredLocateFields,
} from '@/common';
import type { DeviceAction, PlanningAction } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';
import { z } from 'zod';

const actionSpace: DeviceAction[] = [
  { name: 'Back', description: 'Go back', call: rs.fn() },
  {
    name: 'Tap',
    description: 'Tap',
    call: rs.fn(),
    paramSchema: z.object({ locate: getMidsceneLocationSchema() }),
  },
  {
    name: 'Scroll',
    description: 'Scroll',
    call: rs.fn(),
    paramSchema: z.object({
      locate: getMidsceneLocationSchema().optional(),
      distance: z.number().default(100),
    }),
  },
];

const parseActions = (actions: PlanningAction[], actionSpace: DeviceAction[]) =>
  parsePlanningActions(actions, {
    actionSpace,
    parseRawLocateParameter: (value) => value as ParsedPlanningLocateParameter,
    includeLocateInPlanning: false,
    locateResultContext: { preparedSize: { width: 100, height: 100 } },
  });

describe('parsePlanningActions', () => {
  it.each([0, false, '', null])(
    'rejects invalid optional locators: %j',
    (locate) => {
      expect(() =>
        parseActions([{ type: 'Scroll', param: { locate } }], actionSpace),
      ).toThrow(
        'Invalid parameters for action Scroll: locate: Expected an object with a prompt field',
      );
    },
  );

  it('allows an explicitly undefined optional locator', () => {
    const actions = [{ type: 'Scroll', param: { locate: undefined } }];
    expect(() => parseActions(actions, actionSpace)).not.toThrow();
    expect(actions[0].param).toEqual({ locate: undefined });
  });

  it('allows omitted parameters for parameterless actions and optional/default fields', () => {
    const actions: PlanningAction[] = [{ type: 'Back' }, { type: 'Scroll' }];
    expect(() => parseActions(actions, actionSpace)).not.toThrow();
    expect(actions).toEqual([{ type: 'Back' }, { type: 'Scroll' }]);
  });

  it('preserves parameter identity and discards coordinates in prompt-only mode', () => {
    const param = {
      locate: {
        prompt: 'submit',
        bbox: [10, 20, 30, 40],
      },
    };
    const actions = [{ type: 'Tap', param }];
    parseActions(actions, actionSpace);
    expect(actions[0].param).toBe(param);
    expect(param).toEqual({ locate: { prompt: 'submit' } });
  });

  it.each([undefined, {}, { locate: null }, { locate: { prompt: 123 } }])(
    'rejects invalid required locators: %j',
    (param) => {
      expect(() => parseActions([{ type: 'Tap', param }], actionSpace)).toThrow(
        'Invalid parameters for action Tap: locate',
      );
    },
  );

  it.each([
    { value: 'hello' },
    { value: 'hello', count: '2' },
    { value: 123 },
    { value: 'hello', count: -1 },
    {},
  ])('shares execution validation for ordinary parameters: %j', (param) => {
    const schema = z.object({
      value: z.string().transform((value) => value.length),
      count: z.coerce.number().positive().default(1),
    });
    const definition = {
      name: 'Input',
      description: 'Input',
      call: rs.fn(),
      paramSchema: schema,
    };
    const accepts = (validate: () => unknown) => {
      try {
        validate();
        return true;
      } catch {
        return false;
      }
    };
    expect(
      accepts(() => parseActions([{ type: 'Input', param }], [definition])),
    ).toBe(accepts(() => parseActionParam(param, schema)));
  });

  it('preserves raw parameters during preflight and applies defaults at execution', () => {
    const schema = z.object({
      value: z.string().transform((value) => value.length),
      count: z.number().default(1),
    });
    const param = { value: 'hello' };
    parseActions(
      [{ type: 'Input', param }],
      [
        {
          name: 'Input',
          description: 'Input',
          call: rs.fn(),
          paramSchema: schema,
        },
      ],
    );
    expect(param).toEqual({ value: 'hello' });
    expect(parseActionParam(param, schema)).toEqual({ value: 5, count: 1 });
  });

  it('shares ordinary field refinements when a locator is present', () => {
    const schema = z.object({
      locate: getMidsceneLocationSchema(),
      value: z.string().refine((value) => value !== 'invalid'),
    });
    const param = {
      locate: { prompt: 'field', bbox: [10, 20, 30, 40] },
      value: 'invalid',
    };
    expect(() => parseActionParam(param, schema)).toThrow();
    expect(() =>
      parseActions(
        [{ type: 'Input', param }],
        [
          {
            name: 'Input',
            description: 'Input',
            call: rs.fn(),
            paramSchema: schema,
          },
        ],
      ),
    ).toThrow('Invalid parameters for action Input: value');
  });

  it.each([{ prompt: 'submit' }, { prompt: 'submit', bbox: [10, 20, 30, 40] }])(
    'accepts planning locators before execution resolves them: %j',
    (locate) => {
      expect(() =>
        parseActions([{ type: 'Tap', param: { locate } }], actionSpace),
      ).not.toThrow();
      const resolved = {
        center: [20, 30],
        description: 'submit',
        rect: { left: 10, top: 20, width: 21, height: 21 },
      };
      expect(
        parseActionParam({ locate: resolved }, actionSpace[1].paramSchema, {
          shrunkShotToLogicalRatio: 2,
        })?.locate.center,
      ).toEqual([10, 15]);
    },
  );

  it.each([
    {},
    { bbox: [10, 20, 30, 40] },
    { locatedPixelResult: { center: [20, 30] } },
  ])('requires a model-facing prompt: %j', (locate) => {
    expect(() =>
      parseActions([{ type: 'Tap', param: { locate } }], actionSpace),
    ).toThrow('Invalid parameters for action Tap: locate.prompt: Required');
  });

  it('discards extra locator options and coordinates in prompt-only mode', () => {
    const locate = {
      prompt: 'submit',
      deepLocate: 'not a boolean',
      cacheable: 'not a boolean',
      xpath: 123,
      bbox: ['invalid'],
    };
    const actions = [{ type: 'Tap', param: { locate } }];
    expect(() => parseActions(actions, actionSpace)).not.toThrow();
    expect(actions[0].param.locate).toEqual({ prompt: 'submit' });
  });

  it.each(['submit', { prompt: 'submit' }])(
    'accepts supported prompt values: %j',
    (prompt) => {
      expect(() =>
        parseActions(
          [{ type: 'Tap', param: { locate: { prompt } } }],
          actionSpace,
        ),
      ).not.toThrow();
    },
  );

  it.each([123, null, {}, { prompt: 123 }])(
    'rejects invalid prompt values: %j',
    (prompt) => {
      expect(() =>
        parseActions(
          [{ type: 'Tap', param: { locate: { prompt } } }],
          actionSpace,
        ),
      ).toThrow('Invalid parameters for action Tap: locate.prompt');
    },
  );

  it('rejects a string locator instead of treating it as a prompt', () => {
    expect(() =>
      parseActions([{ type: 'Tap', param: { locate: 'submit' } }], actionSpace),
    ).toThrow('locate: Expected an object with a prompt field');
  });

  it('rejects a locator using an unsupported prompt field', () => {
    const actions = [{ type: 'Tap', param: { locate: { label: 'submit' } } }];
    expect(() => parseActions(actions, actionSpace)).toThrow(
      'locate.prompt: Required',
    );
    expect(actions[0].param.locate).toEqual({ label: 'submit' });
  });

  it.each([undefined, {}, { locate: null }, { locate: '' }])(
    'shares required locator checks with task construction: %j',
    (param) => {
      expect(() =>
        validateRequiredLocateFields(param, actionSpace[1].paramSchema),
      ).toThrow('locate: Required');
      expect(() => parseActions([{ type: 'Tap', param }], actionSpace)).toThrow(
        'locate: Required',
      );
    },
  );

  it('rejects unknown actions', () => {
    expect(() => parseActions([{ type: 'Unknown' }], actionSpace)).toThrow(
      "Action type 'Unknown' is not in the current action space",
    );
  });
});
