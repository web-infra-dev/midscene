/**
 * The built-in input primitives understood by the connect protocol.
 * Names and call signatures mirror core's `InputPrimitives`, so the client can
 * rebuild the standard action space with `defineActionsFromInputPrimitives`.
 */
import {
  type ObjectParamSchema,
  type ParamSchema,
  locatedElementSchema,
  pointSchema,
  toLocatedElement,
} from './schema';

export type PrimitiveGroup =
  | 'pointer'
  | 'touch'
  | 'keyboard'
  | 'scroll'
  | 'system';

export interface PrimitiveSpec {
  name: string;
  group: PrimitiveGroup;
  description: string;
  body: ObjectParamSchema;
  /** Client: core call arguments -> JSON body. */
  toBody(...args: any[]): Record<string, unknown>;
  /** Server: JSON body -> call arguments for the device implementation. */
  toArgs(body: Record<string, any>): unknown[];
}

const obj = (
  properties: Record<string, ParamSchema>,
  required: string[] = [],
): ObjectParamSchema => ({ type: 'object', properties, required });
const duration: ParamSchema = {
  type: 'number',
  minimum: 0,
  description: 'Duration in milliseconds',
};
const pick = (o: Record<string, unknown> | undefined, keys: string[]) => {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (o?.[key] !== undefined) out[key] = o[key];
  return out;
};
const point = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });

const pointOnly = (
  name: string,
  description: string,
  group: PrimitiveGroup = 'pointer',
): PrimitiveSpec => ({
  name,
  group,
  description,
  body: obj({ point: pointSchema }, ['point']),
  toBody: (p) => ({ point: point(p) }),
  toArgs: (b) => [b.point],
});

const noArgs = (name: string, description: string): PrimitiveSpec => ({
  name,
  group: 'system',
  description,
  body: obj({}),
  toBody: () => ({}),
  toArgs: () => [],
});

export const primitiveSpecs: PrimitiveSpec[] = [
  {
    name: 'tap',
    group: 'pointer',
    description: 'Tap or click at a point. Required for any pointer input.',
    body: obj({ point: pointSchema, duration }, ['point']),
    toBody: (p, opts) => ({ point: point(p), ...pick(opts, ['duration']) }),
    toArgs: (b) => [b.point, pick(b, ['duration'])],
  },
  pointOnly('doubleClick', 'Double-tap or double-click at a point.'),
  pointOnly('rightClick', 'Right-click at a point.'),
  pointOnly('middleClick', 'Middle-click at a point.'),
  pointOnly('hover', 'Move the pointer over a point.'),
  {
    name: 'longPress',
    group: 'pointer',
    description: 'Press and hold at a point.',
    body: obj({ point: pointSchema, duration }, ['point']),
    toBody: (p, opts) => ({ point: point(p), ...pick(opts, ['duration']) }),
    toArgs: (b) => [b.point, pick(b, ['duration'])],
  },
  {
    name: 'dragAndDrop',
    group: 'pointer',
    description: 'Drag from one point and drop at another.',
    body: obj({ from: pointSchema, to: pointSchema }, ['from', 'to']),
    toBody: (from, to) => ({ from: point(from), to: point(to) }),
    toArgs: (b) => [b.from, b.to],
  },
  {
    name: 'swipe',
    // Mapped to `touch.swipe` or `pointer.swipe` depending on `pointerType`.
    group: 'touch',
    description: 'Swipe from one point to another.',
    body: obj(
      {
        from: pointSchema,
        to: pointSchema,
        duration,
        repeat: { type: 'integer', minimum: 1 },
      },
      ['from', 'to'],
    ),
    toBody: (from, to, opts) => ({
      from: point(from),
      to: point(to),
      ...pick(opts, ['duration', 'repeat']),
    }),
    toArgs: (b) => [b.from, b.to, pick(b, ['duration', 'repeat'])],
  },
  {
    name: 'pinch',
    group: 'touch',
    description:
      'Two-finger pinch around a center point. Requires a touch swipe.',
    body: obj(
      {
        center: pointSchema,
        startDistance: { type: 'number' },
        endDistance: { type: 'number' },
        duration,
      },
      ['center', 'startDistance', 'endDistance', 'duration'],
    ),
    toBody: (center, opts) => ({
      center: point(center),
      ...pick(opts, ['startDistance', 'endDistance', 'duration']),
    }),
    toArgs: (b) => [
      b.center,
      pick(b, ['startDistance', 'endDistance', 'duration']),
    ],
  },
  {
    name: 'typeText',
    group: 'keyboard',
    description:
      'Type text into the focused input. typeText, keyboardPress and clearInput must be provided together.',
    body: obj(
      {
        text: { type: 'string' },
        replace: { type: 'boolean' },
        focusOnly: { type: 'boolean' },
        autoDismissKeyboard: { type: 'boolean' },
      },
      ['text'],
    ),
    toBody: (text, opts) => ({
      text,
      ...pick(opts, ['replace', 'focusOnly', 'autoDismissKeyboard']),
    }),
    toArgs: (b) => [
      b.text,
      pick(b, ['replace', 'focusOnly', 'autoDismissKeyboard']),
    ],
  },
  {
    name: 'keyboardPress',
    group: 'keyboard',
    description: 'Press a key or key combination, e.g. "Enter" or "Control+A".',
    body: obj({ key: { type: 'string', minLength: 1 } }, ['key']),
    toBody: (key) => ({ key }),
    toArgs: (b) => [b.key],
  },
  {
    name: 'clearInput',
    group: 'keyboard',
    description: 'Clear the focused input.',
    body: obj({}),
    toBody: () => ({}),
    toArgs: () => [],
  },
  {
    name: 'cursorMove',
    group: 'keyboard',
    description: 'Move the text cursor left or right.',
    body: obj(
      {
        direction: { type: 'string', enum: ['left', 'right'] },
        times: { type: 'integer', minimum: 1 },
      },
      ['direction'],
    ),
    toBody: (direction, times) => ({
      direction,
      ...(times === undefined ? {} : { times }),
    }),
    toArgs: (b) => [b.direction, b.times],
  },
  {
    name: 'scroll',
    group: 'scroll',
    description: 'Scroll the screen or the located region.',
    body: obj({
      direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
      scrollType: {
        type: 'string',
        enum: [
          'singleAction',
          'scrollToBottom',
          'scrollToTop',
          'scrollToRight',
          'scrollToLeft',
        ],
      },
      distance: { type: 'number' },
      locate: locatedElementSchema,
    }),
    toBody: (param) => ({
      ...pick(param, ['direction', 'scrollType']),
      ...(typeof param?.distance === 'number'
        ? { distance: param.distance }
        : {}),
      ...(param?.locate ? { locate: toLocatedElement(param.locate) } : {}),
    }),
    toArgs: (b) => [b],
  },
  noArgs('backButton', 'Trigger the system "back" operation.'),
  noArgs('homeButton', 'Go to the home screen.'),
  noArgs('recentAppsButton', 'Open the recent apps view.'),
];

export const primitiveByName = new Map(primitiveSpecs.map((p) => [p.name, p]));

/** Action names the client registers for system primitives. */
export const systemActionConfigs = {
  backButton: {
    name: 'BackButton',
    supportedBySystemOne: true,
    description: 'Trigger the system "back" operation on the device',
  },
  homeButton: {
    name: 'HomeButton',
    supportedBySystemOne: true,
    description: 'Go to the home screen of the device',
  },
  recentAppsButton: {
    name: 'RecentAppsButton',
    supportedBySystemOne: true,
    description: 'Open the recent apps view of the device',
  },
};
