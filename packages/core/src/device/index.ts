import { getMidsceneLocationSchema } from '@/common';
import type {
  ActionScrollParam,
  DeviceAction,
  LocateResultElement,
} from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import type { ElementNode } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import { _keyDefinitions } from '@midscene/shared/us-keyboard-layout';
import { z } from 'zod';
import type { ElementCacheFeature, Rect, Size, UIContext } from '../types';

export abstract class AbstractInterface {
  abstract interfaceType: string;

  abstract screenshotBase64(): Promise<string>;
  abstract size(): Promise<Size>;
  abstract actionSpace(): DeviceAction[];

  abstract cacheFeatureForRect?(
    rect: Rect,
    options?: {
      targetDescription?: string;
      modelConfig?: IModelConfig;
    },
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
// TReturn allows specifying the return type of the action
export const defineAction = <
  TSchema extends z.ZodType | undefined = undefined,
  TRuntime = TSchema extends z.ZodType ? z.infer<TSchema> : undefined,
  TReturn = any,
>(
  config: {
    name: string;
    description: string;
    interfaceAlias?: string;
    paramSchema?: TSchema;
    call: (param: TRuntime) => Promise<TReturn> | TReturn;
  } & Partial<
    Omit<
      DeviceAction<TRuntime, TReturn>,
      'name' | 'description' | 'interfaceAlias' | 'paramSchema' | 'call'
    >
  >,
): DeviceAction<TRuntime, TReturn> => {
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
const inputLocateDescription =
  'the position of the placeholder or text content in the target input field. If there is no content, locate the center of the input field.';
export const actionInputParamSchema = z.object({
  value: z
    .union([z.string(), z.number()])
    .transform((val) => String(val))
    .describe(
      'The text to input. Provide the final content for replace/append modes, or an empty string when using clear mode to remove existing text.',
    ),
  locate: getMidsceneLocationSchema()
    .describe(inputLocateDescription)
    .optional(),
  mode: z
    .enum(['replace', 'clear', 'append'])
    .default('replace')
    .optional()
    .describe(
      'Input mode: "replace" (default) - clear the field and input the value; "append" - append the value to existing content; "clear" - clear the field without inputting new text.',
    ),
});
export type ActionInputParam = {
  value: string;
  locate?: LocateResultElement;
  mode?: 'replace' | 'clear' | 'append';
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
  keyName: z
    .string()
    .describe(
      "The key to be pressed. Use '+' for key combinations, e.g., 'Control+A', 'Shift+Enter'",
    ),
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
      'Press a key or key combination, like "Enter", "Tab", "Escape", or "Control+A", "Shift+Enter". Do not use this to type text.',
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
    .enum([
      'singleAction',
      'scrollToBottom',
      'scrollToTop',
      'scrollToRight',
      'scrollToLeft',
    ])
    .default('singleAction')
    .describe(
      'The scroll behavior: "singleAction" for a single scroll action, "scrollToBottom" for scrolling to the bottom, "scrollToTop" for scrolling to the top, "scrollToRight" for scrolling to the right, "scrollToLeft" for scrolling to the left',
    ),
  distance: z
    .number()
    .nullable()
    .optional()
    .describe('The distance in pixels to scroll'),
  locate: getMidsceneLocationSchema()
    .optional()
    .describe('The target element to be scrolled'),
});

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
    description:
      'Drag and drop (hold the mouse or finger down and move the mouse) ',
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

// ClearInput
export const actionClearInputParamSchema = z.object({
  locate: getMidsceneLocationSchema().describe('The input field to be cleared'),
});
export type ActionClearInputParam = {
  locate: LocateResultElement;
};

export const defineActionClearInput = (
  call: (param: ActionClearInputParam) => Promise<void>,
): DeviceAction<ActionClearInputParam> => {
  return defineAction<
    typeof actionClearInputParamSchema,
    ActionClearInputParam
  >({
    name: 'ClearInput',
    description: inputLocateDescription,
    interfaceAlias: 'aiClearInput',
    paramSchema: actionClearInputParamSchema,
    call,
  });
};

// Assert
export const actionAssertParamSchema = z.object({
  condition: z.string().describe('The condition of the assertion'),
  thought: z
    .string()
    .describe(
      'The thought of the assertion, like "I can see there are A, B, C elements on the page, which means ... , so the assertion is true"',
    ),
  result: z.boolean().describe('The result of the assertion, true or false'),
});
export type ActionAssertParam = {
  condition: string;
  thought: string;
  result: boolean;
};

export const defineActionAssert = (): DeviceAction<ActionAssertParam> => {
  return defineAction<typeof actionAssertParamSchema, ActionAssertParam>({
    name: 'Print_Assert_Result',
    description: 'Print the result of the assertion',
    paramSchema: actionAssertParamSchema,
    call: async (param) => {
      if (typeof param?.result !== 'boolean') {
        throw new Error(
          `The result of the assertion must be a boolean, but got: ${typeof param?.result}. ${param.thought || '(no thought)'}`,
        );
      }

      getDebug('device:common-action')(
        `Assert: ${param.condition}, Thought: ${param.thought}, Result: ${param.result}`,
      );

      if (!param.result) {
        throw new Error(
          `Assertion failed: ${param.thought || '(no thought)'}. (Assertion = ${param.condition})`,
        );
      }
    },
  });
};

export type { DeviceAction } from '../types';
export type {
  AndroidDeviceOpt,
  AndroidDeviceInputOpt,
  IOSDeviceOpt,
  IOSDeviceInputOpt,
} from './device-options';
