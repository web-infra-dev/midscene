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

export interface FileChooserHandler {
  accept(files: string[]): Promise<void>;
}

export abstract class AbstractInterface {
  abstract interfaceType: string;

  abstract screenshotBase64(): Promise<string>;
  abstract size(): Promise<Size>;
  abstract actionSpace(): DeviceAction[];

  abstract cacheFeatureForPoint?(
    center: [number, number],
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

  // for web only
  registerFileChooserListener?(
    handler: (chooser: FileChooserHandler) => Promise<void>,
  ): Promise<{ dispose: () => void; getError: () => Error | undefined }>;

  // @deprecated do NOT extend this method
  abstract getElementsNodeTree?: () => Promise<ElementNode>;

  // @deprecated do NOT extend this method
  abstract url?: () => string | Promise<string>;

  // @deprecated do NOT extend this method
  abstract evaluateJavaScript?<T = any>(script: string): Promise<T>;

  // @deprecated do NOT extend this method
  abstract getContext?(): Promise<UIContext>;

  /**
   * Get the current time from the device.
   * Returns the device's current timestamp in milliseconds.
   * This is useful when the system time and device time are not synchronized.
   */
  getTimestamp?(): Promise<number>;
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
    .enum(['replace', 'clear', 'typeOnly'])
    .default('replace')
    .describe(
      'Input mode: "replace" (default) - clear the field and input the value; "typeOnly" - type the value directly without clearing the field first; "clear" - clear the field without inputting new text.',
    ),
});
export type ActionInputParam = {
  value: string;
  locate?: LocateResultElement;
  mode?: 'replace' | 'clear' | 'typeOnly' | 'append';
};

export const defineActionInput = (
  call: (param: ActionInputParam) => Promise<void>,
): DeviceAction<ActionInputParam> => {
  return defineAction<typeof actionInputParamSchema, ActionInputParam>({
    name: 'Input',
    description: 'Input the value into the element',
    interfaceAlias: 'aiInput',
    paramSchema: actionInputParamSchema,
    call: (param) => {
      // backward compat: convert deprecated 'append' to 'typeOnly'
      if ((param.mode as string) === 'append') {
        param.mode = 'typeOnly';
      }
      return call(param);
    },
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
      'The scroll behavior: "singleAction" for a single scroll action, "scrollToBottom" for scrolling all the way to the bottom by rapidly scrolling 5-10 times (skipping intermediate content until reaching the bottom), "scrollToTop" for scrolling all the way to the top by rapidly scrolling 5-10 times (skipping intermediate content until reaching the top), "scrollToRight" for scrolling all the way to the right by rapidly scrolling multiple times, "scrollToLeft" for scrolling all the way to the left by rapidly scrolling multiple times',
    ),
  direction: z
    .enum(['down', 'up', 'right', 'left'])
    .default('down')
    .describe(
      'The direction to scroll. Only effective when scrollType is "singleAction".',
    ),
  distance: z
    .number()
    .nullable()
    .optional()
    .describe('The distance in pixels to scroll'),
  duration: z
    .number()
    .optional()
    .describe(
      'Duration of the scroll gesture in milliseconds. Only effective on mobile platforms (Android/iOS). A smaller value means faster scrolling.',
    ),
  locate: getMidsceneLocationSchema()
    .optional()
    .describe(
      'Describe the target element to be scrolled on, like "the table" or "the list" or "the content area" or "the scrollable area". Do NOT provide a general intent like "scroll to find some element"',
    ),
});

export const defineActionScroll = (
  call: (param: ActionScrollParam) => Promise<void>,
): DeviceAction<ActionScrollParam> => {
  return defineAction<typeof actionScrollParamSchema, ActionScrollParam>({
    name: 'Scroll',
    description:
      'Scroll the page or a scrollable element to browse content. This is the preferred way to scroll on all platforms, including mobile. Supports scrollToBottom/scrollToTop for boundary navigation. Default: direction `down`, scrollType `singleAction`, distance `null`.',
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
      'Pick up a specific UI element and move it to a new position (e.g., reorder a card, move a file into a folder, sort list items). The element itself moves with your finger/mouse.',
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

export function normalizeMobileSwipeParam(
  param: ActionSwipeParam,
  screenSize: { width: number; height: number },
): {
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  duration: number;
  repeatCount: number;
} {
  const { width, height } = screenSize;
  const { start, end } = param;

  const startPoint = start
    ? { x: start.center[0], y: start.center[1] }
    : { x: width / 2, y: height / 2 };

  let endPoint: { x: number; y: number };

  if (end) {
    endPoint = { x: end.center[0], y: end.center[1] };
  } else if (param.distance) {
    const direction = param.direction;
    if (!direction) {
      throw new Error('direction is required for swipe gesture');
    }
    endPoint = {
      x:
        startPoint.x +
        (direction === 'right'
          ? param.distance
          : direction === 'left'
            ? -param.distance
            : 0),
      y:
        startPoint.y +
        (direction === 'down'
          ? param.distance
          : direction === 'up'
            ? -param.distance
            : 0),
    };
  } else {
    throw new Error(
      'Either end or distance must be specified for swipe gesture',
    );
  }

  endPoint.x = Math.max(0, Math.min(endPoint.x, width));
  endPoint.y = Math.max(0, Math.min(endPoint.y, height));

  const duration = param.duration ?? 300;

  let repeatCount = typeof param.repeat === 'number' ? param.repeat : 1;
  if (repeatCount === 0) {
    repeatCount = 10;
  }

  return { startPoint, endPoint, duration, repeatCount };
}

export const defineActionSwipe = (
  call: (param: ActionSwipeParam) => Promise<void>,
): DeviceAction<ActionSwipeParam> => {
  return defineAction<typeof ActionSwipeParamSchema, ActionSwipeParam>({
    name: 'Swipe',
    description:
      'Perform a touch gesture for interactions beyond regular scrolling (e.g., flip pages in a carousel, dismiss a notification, swipe-to-delete a list item). For regular content scrolling, use Scroll instead. Use "distance" + "direction" for relative movement, or "end" for precise endpoint.',
    paramSchema: ActionSwipeParamSchema,
    call,
  });
};

// ClearInput
export const actionClearInputParamSchema = z.object({
  locate: getMidsceneLocationSchema()
    .describe('The input field to be cleared')
    .optional(),
});
export type ActionClearInputParam = {
  locate?: LocateResultElement;
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

// CursorMove
export const actionCursorMoveParamSchema = z.object({
  direction: z
    .enum(['left', 'right'])
    .describe('The direction to move the cursor'),
  times: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      'The number of times to move the cursor in the specified direction',
    ),
});
export type ActionCursorMoveParam = {
  direction: 'left' | 'right';
  times?: number;
};

export const defineActionCursorMove = (
  call: (param: ActionCursorMoveParam) => Promise<void>,
): DeviceAction<ActionCursorMoveParam> => {
  return defineAction<
    typeof actionCursorMoveParamSchema,
    ActionCursorMoveParam
  >({
    name: 'CursorMove',
    description:
      'Move the text cursor (caret) left or right within an input field or text area. Use this to reposition the cursor without selecting text.',
    paramSchema: actionCursorMoveParamSchema,
    call,
  });
};
// Sleep
export const ActionSleepParamSchema = z.object({
  timeMs: z
    .number()
    .default(1000)
    .optional()
    .describe('Sleep duration in milliseconds, defaults to 1000ms (1 second)'),
});

export type ActionSleepParam = {
  timeMs?: number;
};

export const defineActionSleep = (): DeviceAction<ActionSleepParam> => {
  return defineAction<typeof ActionSleepParamSchema, ActionSleepParam>({
    name: 'Sleep',
    description:
      'Wait for a specified duration before continuing. Defaults to 1 second (1000ms) if not specified.',
    paramSchema: ActionSleepParamSchema,
    call: async (param) => {
      const duration = param?.timeMs ?? 1000;
      getDebug('device:common-action')(`Sleeping for ${duration}ms`);
      await new Promise((resolve) => setTimeout(resolve, duration));
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
