import { getMidsceneLocationSchema } from '@/ai-model';
import type { DeviceAction, LocateResultElement } from '@/types';
import type { ElementNode } from '@midscene/shared/extractor';
import { _keyDefinitions } from '@midscene/shared/us-keyboard-layout';
import { z } from 'zod';
import type { ElementCacheFeature, Rect, Size, UIContext } from '../types';

export abstract class AbstractInterface {
  abstract interfaceType: string;

  abstract screenshotBase64(): Promise<string>;
  abstract size(): Promise<Size>;
  abstract actionSpace(): DeviceAction[] | Promise<DeviceAction[]>;

  abstract cacheFeatureForRect?(
    rect: Rect,
    opt?: { _orderSensitive: boolean },
  ): Promise<ElementCacheFeature>;
  abstract rectMatchesCacheFeature?(
    feature: ElementCacheFeature,
  ): Promise<Rect>;

  abstract destroy?(): Promise<void>;

  abstract describe?(): string;
  abstract beforeInvokeAction?(actionName: string, param: any): Promise<void>;
  abstract afterInvokeAction?(actionName: string, param: any): Promise<void>;

  // @deprecated do NOT extend this method
  abstract getElementsNodeTree?: () => Promise<ElementNode>;

  // @deprecated do NOT extend this method
  abstract url?: () => string | Promise<string>;

  // @deprecated do NOT extend this method
  abstract evaluateJavaScript?<T = any>(script: string): Promise<T>;

  // @deprecated do NOT extend this method
  abstract getContext?(): Promise<UIContext>;
}

// Generic function to define actions with proper type inference
// TRuntime allows specifying a different type for the runtime parameter (after location resolution)
export const defineAction = <
  TSchema extends z.ZodType,
  TRuntime = z.infer<TSchema>,
>(
  config: {
    name: string;
    description: string;
    interfaceAlias?: string;
    paramSchema: TSchema;
    call: (param: TRuntime) => Promise<void>;
  } & Partial<
    Omit<
      DeviceAction<TRuntime>,
      'name' | 'description' | 'interfaceAlias' | 'paramSchema' | 'call'
    >
  >,
): DeviceAction<TRuntime> => {
  return config as any; // Type assertion needed because schema validation type differs from runtime type
};

// Tap
export const actionTapParamSchema = z.object({
  locate: getMidsceneLocationSchema().describe('The element to be tapped'),
});
// Override the inferred type to use LocateResultElement for the runtime locate field
export type ActionTapParam = {
  locate: LocateResultElement;
};

export const defineActionTap = (
  call: (param: ActionTapParam) => Promise<void>,
): DeviceAction<ActionTapParam> => {
  return defineAction<typeof actionTapParamSchema, ActionTapParam>({
    name: 'Tap',
    description: 'Tap the element',
    interfaceAlias: 'aiTap',
    paramSchema: actionTapParamSchema,
    call,
  });
};

// RightClick
export const actionRightClickParamSchema = z.object({
  locate: getMidsceneLocationSchema().describe(
    'The element to be right clicked',
  ),
});
export type ActionRightClickParam = {
  locate: LocateResultElement;
};

export const defineActionRightClick = (
  call: (param: ActionRightClickParam) => Promise<void>,
): DeviceAction<ActionRightClickParam> => {
  return defineAction<
    typeof actionRightClickParamSchema,
    ActionRightClickParam
  >({
    name: 'RightClick',
    description: 'Right click the element',
    interfaceAlias: 'aiRightClick',
    paramSchema: actionRightClickParamSchema,
    call,
  });
};

// DoubleClick
export const actionDoubleClickParamSchema = z.object({
  locate: getMidsceneLocationSchema().describe(
    'The element to be double clicked',
  ),
});
export type ActionDoubleClickParam = {
  locate: LocateResultElement;
};

export const defineActionDoubleClick = (
  call: (param: ActionDoubleClickParam) => Promise<void>,
): DeviceAction<ActionDoubleClickParam> => {
  return defineAction<
    typeof actionDoubleClickParamSchema,
    ActionDoubleClickParam
  >({
    name: 'DoubleClick',
    description: 'Double click the element',
    interfaceAlias: 'aiDoubleClick',
    paramSchema: actionDoubleClickParamSchema,
    call,
  });
};

// Hover
export const actionHoverParamSchema = z.object({
  locate: getMidsceneLocationSchema().describe('The element to be hovered'),
});
export type ActionHoverParam = {
  locate: LocateResultElement;
};

export const defineActionHover = (
  call: (param: ActionHoverParam) => Promise<void>,
): DeviceAction<ActionHoverParam> => {
  return defineAction<typeof actionHoverParamSchema, ActionHoverParam>({
    name: 'Hover',
    description: 'Move the mouse to the element',
    interfaceAlias: 'aiHover',
    paramSchema: actionHoverParamSchema,
    call,
  });
};

// Input
export const actionInputParamSchema = z.object({
  value: z.string().describe('The value to be input'),
  locate: getMidsceneLocationSchema()
    .describe('The element to be input')
    .optional(),
});
export type ActionInputParam = {
  value: string;
  locate?: LocateResultElement;
};

export const defineActionInput = (
  call: (param: ActionInputParam) => Promise<void>,
): DeviceAction<ActionInputParam> => {
  return defineAction<typeof actionInputParamSchema, ActionInputParam>({
    name: 'Input',
    description: 'Input the value into the element',
    interfaceAlias: 'aiInput',
    paramSchema: actionInputParamSchema,
    call,
  });
};

// KeyboardPress
export const actionKeyboardPressParamSchema = z.object({
  locate: getMidsceneLocationSchema()
    .describe('The element to be clicked before pressing the key')
    .optional(),
  keyName: z.string().describe('The key to be pressed'),
});
export type ActionKeyboardPressParam = {
  locate?: LocateResultElement;
  keyName: string;
};

export const defineActionKeyboardPress = (
  call: (param: ActionKeyboardPressParam) => Promise<void>,
): DeviceAction<ActionKeyboardPressParam> => {
  return defineAction<
    typeof actionKeyboardPressParamSchema,
    ActionKeyboardPressParam
  >({
    name: 'KeyboardPress',
    description:
      'Press a function key, like "Enter", "Tab", "Escape". Do not use this to type text.',
    interfaceAlias: 'aiKeyboardPress',
    paramSchema: actionKeyboardPressParamSchema,
    call,
  });
};

// Scroll
export const actionScrollParamSchema = z.object({
  direction: z
    .enum(['down', 'up', 'right', 'left'])
    .default('down')
    .describe('The direction to scroll'),
  scrollType: z
    .enum(['once', 'untilBottom', 'untilTop', 'untilRight', 'untilLeft'])
    .default('once')
    .describe('The scroll type'),
  distance: z
    .number()
    .nullable()
    .optional()
    .describe('The distance in pixels to scroll'),
  locate: getMidsceneLocationSchema()
    .optional()
    .describe('The element to be scrolled'),
});
export type ActionScrollParam = {
  direction?: 'down' | 'up' | 'right' | 'left';
  scrollType?: 'once' | 'untilBottom' | 'untilTop' | 'untilRight' | 'untilLeft';
  distance?: number | null;
  locate?: LocateResultElement;
};

export const defineActionScroll = (
  call: (param: ActionScrollParam) => Promise<void>,
): DeviceAction<ActionScrollParam> => {
  return defineAction<typeof actionScrollParamSchema, ActionScrollParam>({
    name: 'Scroll',
    description:
      'Scroll the page or an element. The direction to scroll, the scroll type, and the distance to scroll. The distance is the number of pixels to scroll. If not specified, use `down` direction, `once` scroll type, and `null` distance.',
    interfaceAlias: 'aiScroll',
    paramSchema: actionScrollParamSchema,
    call,
  });
};

// DragAndDrop
export const actionDragAndDropParamSchema = z.object({
  from: getMidsceneLocationSchema().describe('The position to be dragged'),
  to: getMidsceneLocationSchema().describe('The position to be dropped'),
});
export type ActionDragAndDropParam = {
  from: LocateResultElement;
  to: LocateResultElement;
};

export const defineActionDragAndDrop = (
  call: (param: ActionDragAndDropParam) => Promise<void>,
): DeviceAction<ActionDragAndDropParam> => {
  return defineAction<
    typeof actionDragAndDropParamSchema,
    ActionDragAndDropParam
  >({
    name: 'DragAndDrop',
    description: 'Drag and drop the element',
    interfaceAlias: 'aiDragAndDrop',
    paramSchema: actionDragAndDropParamSchema,
    call,
  });
};

export const ActionLongPressParamSchema = z.object({
  locate: getMidsceneLocationSchema().describe(
    'The element to be long pressed',
  ),
  duration: z
    .number()
    .default(500)
    .optional()
    .describe('Long press duration in milliseconds'),
});

export type ActionLongPressParam = {
  locate: LocateResultElement;
  duration?: number;
};
export const defineActionLongPress = (
  call: (param: ActionLongPressParam) => Promise<void>,
): DeviceAction<ActionLongPressParam> => {
  return defineAction<typeof ActionLongPressParamSchema, ActionLongPressParam>({
    name: 'LongPress',
    description: 'Long press the element',
    paramSchema: ActionLongPressParamSchema,
    call,
  });
};

export const ActionSwipeParamSchema = z.object({
  start: getMidsceneLocationSchema()
    .optional()
    .describe(
      'Starting point of the swipe gesture, if not specified, the center of the page will be used',
    ),
  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe(
      'The direction to swipe (required when using distance). The direction means the direction of the finger swipe.',
    ),
  distance: z
    .number()
    .optional()
    .describe('The distance in pixels to swipe (mutually exclusive with end)'),
  end: getMidsceneLocationSchema()
    .optional()
    .describe(
      'Ending point of the swipe gesture (mutually exclusive with distance)',
    ),
  duration: z
    .number()
    .default(300)
    .describe('Duration of the swipe gesture in milliseconds'),
  repeat: z
    .number()
    .optional()
    .describe(
      'The number of times to repeat the swipe gesture. 1 for default, 0 for infinite (e.g. endless swipe until the end of the page)',
    ),
});

export type ActionSwipeParam = {
  start?: LocateResultElement;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  end?: LocateResultElement;
  duration?: number;
  repeat?: number;
};

export const defineActionSwipe = (
  call: (param: ActionSwipeParam) => Promise<void>,
): DeviceAction<ActionSwipeParam> => {
  return defineAction<typeof ActionSwipeParamSchema, ActionSwipeParam>({
    name: 'Swipe',
    description:
      'Perform a swipe gesture. You must specify either "end" (target location) or "distance" + "direction" - they are mutually exclusive. Use "end" for precise location-based swipes, or "distance" + "direction" for relative movement.',
    paramSchema: ActionSwipeParamSchema,
    call,
  });
};

export type { DeviceAction } from '../types';
