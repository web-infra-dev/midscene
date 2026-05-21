import { getMidsceneLocationSchema } from '@/common';
import type {
  ActionScrollParam,
  DeviceAction,
  ExtraPlanningContextOptions,
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

export interface MjpegStreamFrame {
  /** Raw base64-encoded image bytes WITHOUT a `data:image/...;base64,` prefix. */
  data: string;
  contentType?: string;
}

export interface MjpegStreamHandle {
  stop(): void | Promise<void>;
}

export interface MjpegStreamOptions {
  signal?: AbortSignal;
  onFrame(frame: MjpegStreamFrame): void;
  onError?(error: unknown): void;
}

/** A point in device-pixel coordinates on the screen. */
export interface PointerPoint {
  x: number;
  y: number;
}

export interface PointerInputPrimitives {
  tap(p: PointerPoint, opts?: { duration?: number }): Promise<void>;
  doubleClick?(p: PointerPoint): Promise<void>;
  rightClick?(p: PointerPoint): Promise<void>;
  hover?(p: PointerPoint): Promise<void>;
  longPress?(p: PointerPoint, opts?: { duration?: number }): Promise<void>;
  dragAndDrop?(from: PointerPoint, to: PointerPoint): Promise<void>;
}

export interface TouchInputPrimitives {
  swipe(
    start: PointerPoint,
    end: PointerPoint,
    opts?: { duration?: number; repeat?: number },
  ): Promise<void>;
  pinch?(
    center: PointerPoint,
    opts: { startDistance: number; endDistance: number; duration: number },
  ): Promise<void>;
}

export interface KeyboardInputPrimitives {
  keyboardPress(keyName: string, opts?: { target?: unknown }): Promise<void>;
  cursorMove?(direction: 'left' | 'right', times?: number): Promise<void>;
  typeText(
    value: string,
    opts?: {
      autoDismissKeyboard?: boolean;
      target?: unknown;
      replace?: boolean;
      focusOnly?: boolean;
    },
  ): Promise<void>;
  clearInput(target?: unknown): Promise<void>;
}

export interface ScrollInputPrimitives {
  scroll(param: ActionScrollParam): Promise<void>;
}

export interface SystemInputPrimitives {
  backButton?(): Promise<void>;
  homeButton?(): Promise<void>;
  recentAppsButton?(): Promise<void>;
}

export interface InputPrimitives {
  pointer?: PointerInputPrimitives;
  keyboard?: KeyboardInputPrimitives;
  touch?: TouchInputPrimitives;
  scroll?: ScrollInputPrimitives;
  system?: SystemInputPrimitives;
}

export interface MobileInputPrimitives extends InputPrimitives {
  pointer: PointerInputPrimitives & {
    doubleClick(p: PointerPoint): Promise<void>;
    longPress(p: PointerPoint, opts?: { duration?: number }): Promise<void>;
    dragAndDrop(from: PointerPoint, to: PointerPoint): Promise<void>;
  };
  keyboard: KeyboardInputPrimitives;
  touch: TouchInputPrimitives;
}

export interface BrowserInputPrimitives extends InputPrimitives {
  pointer: PointerInputPrimitives & {
    doubleClick(p: PointerPoint): Promise<void>;
    rightClick(p: PointerPoint): Promise<void>;
    hover(p: PointerPoint): Promise<void>;
    dragAndDrop(from: PointerPoint, to: PointerPoint): Promise<void>;
    longPress(p: PointerPoint, opts?: { duration?: number }): Promise<void>;
  };
  keyboard: KeyboardInputPrimitives;
  scroll: ScrollInputPrimitives;
  touch: TouchInputPrimitives;
}

export interface ComputerInputPrimitives extends InputPrimitives {
  pointer: PointerInputPrimitives & {
    doubleClick(p: PointerPoint): Promise<void>;
    rightClick(p: PointerPoint): Promise<void>;
    hover(p: PointerPoint): Promise<void>;
    dragAndDrop(from: PointerPoint, to: PointerPoint): Promise<void>;
  };
  keyboard: KeyboardInputPrimitives;
  scroll: ScrollInputPrimitives;
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

  /**
   * Get the current device-local time as a formatted string.
   * Prefer this for user-visible time because timestamps alone do not preserve
   * the target device's timezone when formatted on the host machine.
   */
  getDeviceLocalTimeString?(format?: string): Promise<string>;

  /** URL of native MJPEG stream for real-time screen preview (e.g. WDA MJPEG server) */
  mjpegStreamUrl?: string;

  /**
   * Optional in-process MJPEG frame producer. Implementations can push raw
   * base64 frames here when there is no standalone native MJPEG URL, e.g.
   * Chromium CDP Page.startScreencast for web previews.
   */
  startMjpegStream?(
    options: MjpegStreamOptions,
  ): MjpegStreamHandle | undefined | Promise<MjpegStreamHandle | undefined>;

  /**
   * Optional hook used after keyboard-only actions to force a fresh frame on
   * the active MJPEG stream. Implementations should be a no-op when no stream
   * is active.
   */
  flushPendingVisualUpdate?(): Promise<void>;

  /**
   * Optional navigation state probe for browser-like interfaces, used to drive
   * loading indicators in playground UIs. Returning `undefined` means the
   * interface does not expose this concept.
   */
  navigationState?(): Promise<{ isLoading: boolean }>;

  /**
   * Low-level device input surface. Platform implementations expose transport
   * primitives here; higher-level AI actions and manual pointer dispatch should
   * adapt to this instead of duplicating platform gesture logic.
   */
  inputPrimitives?: InputPrimitives;

  /**
   * Optional hook called before each planning cycle in aiAct.
   * Returns extra context string to append to actionContext.
   * Called on every replan, so implementations can return fresh data (e.g. updated DOM).
   */
  getExtraPlanningContext?(
    options?: ExtraPlanningContextOptions,
  ): Promise<string>;
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

function pointFromLocate(
  locate: LocateResultElement | undefined,
  missingMessage: string,
): PointerPoint {
  if (!locate) {
    throw new Error(missingMessage);
  }
  return { x: locate.center[0], y: locate.center[1] };
}

function defineLocatedPointAction<
  TSchema extends z.ZodType,
  TParam extends { locate: LocateResultElement },
>(config: {
  name: string;
  description: string;
  interfaceAlias?: string;
  paramSchema: TSchema;
  sample: DeviceAction<TParam>['sample'];
  missingLocateMessage: string;
  call: (point: PointerPoint, param: TParam) => Promise<void>;
}): DeviceAction<TParam> {
  return defineAction<TSchema, TParam>({
    name: config.name,
    description: config.description,
    interfaceAlias: config.interfaceAlias,
    paramSchema: config.paramSchema,
    sample: config.sample,
    call: async (param) => {
      await config.call(
        pointFromLocate(param.locate, config.missingLocateMessage),
        param,
      );
    },
  });
}

// Tap
export const actionTapParamSchema = z.object({
  locate: getMidsceneLocationSchema().describe('The element to be tapped'),
});
export type ActionTapParam = {
  locate: LocateResultElement;
};

export const defineActionTap = (
  tap: PointerInputPrimitives['tap'],
): DeviceAction<ActionTapParam> => {
  return defineLocatedPointAction<typeof actionTapParamSchema, ActionTapParam>({
    name: 'Tap',
    description: 'Tap the element',
    interfaceAlias: 'aiTap',
    paramSchema: actionTapParamSchema,
    sample: {
      locate: { prompt: 'the "Submit" button' },
    },
    missingLocateMessage: 'Element not found, cannot tap',
    call: async (point) => {
      await tap(point);
    },
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
  rightClick: NonNullable<PointerInputPrimitives['rightClick']>,
): DeviceAction<ActionRightClickParam> => {
  return defineLocatedPointAction<
    typeof actionRightClickParamSchema,
    ActionRightClickParam
  >({
    name: 'RightClick',
    description: 'Right click the element',
    interfaceAlias: 'aiRightClick',
    paramSchema: actionRightClickParamSchema,
    sample: {
      locate: { prompt: 'the file icon on the desktop' },
    },
    missingLocateMessage: 'Element not found, cannot right click',
    call: async (point) => {
      await rightClick(point);
    },
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
  doubleClick: NonNullable<PointerInputPrimitives['doubleClick']>,
): DeviceAction<ActionDoubleClickParam> => {
  return defineLocatedPointAction<
    typeof actionDoubleClickParamSchema,
    ActionDoubleClickParam
  >({
    name: 'DoubleClick',
    description: 'Double click the element',
    interfaceAlias: 'aiDoubleClick',
    paramSchema: actionDoubleClickParamSchema,
    sample: {
      locate: { prompt: 'the folder icon' },
    },
    missingLocateMessage: 'Element not found, cannot double click',
    call: async (point) => {
      await doubleClick(point);
    },
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
  hover: NonNullable<PointerInputPrimitives['hover']>,
): DeviceAction<ActionHoverParam> => {
  return defineLocatedPointAction<
    typeof actionHoverParamSchema,
    ActionHoverParam
  >({
    name: 'Hover',
    description: 'Move the mouse to the element',
    interfaceAlias: 'aiHover',
    paramSchema: actionHoverParamSchema,
    sample: {
      locate: { prompt: 'the navigation menu item "Products"' },
    },
    missingLocateMessage: 'Element not found, cannot hover',
    call: async (point) => {
      await hover(point);
    },
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
  autoDismissKeyboard: z
    .boolean()
    .optional()
    .describe(
      'If true, the keyboard will be dismissed after the input is completed. Do not set it unless the user asks you to do so.',
    ),
});
export type ActionInputParam = {
  value: string;
  locate?: LocateResultElement;
  mode?: 'replace' | 'clear' | 'typeOnly' | 'append';
  autoDismissKeyboard?: boolean;
};

export const defineActionInput = (
  keyboard: KeyboardInputPrimitives,
): DeviceAction<ActionInputParam> => {
  return defineAction<typeof actionInputParamSchema, ActionInputParam>({
    name: 'Input',
    description: 'Input the value into the element',
    interfaceAlias: 'aiInput',
    paramSchema: actionInputParamSchema,
    sample: {
      value: 'test@example.com',
      locate: { prompt: 'the email input field' },
    },
    call: async (param) => {
      // backward compat: convert deprecated 'append' to 'typeOnly'
      if ((param.mode as string) === 'append') {
        param.mode = 'typeOnly';
      }

      if (param.mode === 'clear') {
        await keyboard.clearInput(param.locate);
        return;
      }

      if (!param || !param.value) {
        return;
      }

      await keyboard.typeText(param.value, {
        target: param.locate,
        replace: param.mode !== 'typeOnly',
        autoDismissKeyboard: param.autoDismissKeyboard,
      });
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
  keyboardPress: KeyboardInputPrimitives['keyboardPress'],
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
    sample: {
      keyName: 'Enter',
    },
    call: async (param) => {
      await keyboardPress(param.keyName, {
        target: param.locate,
      });
    },
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
  locate: getMidsceneLocationSchema()
    .optional()
    .describe(
      'Describe the target element to be scrolled on, like "the table" or "the list" or "the content area" or "the scrollable area". Do NOT provide a general intent like "scroll to find some element"',
    ),
});

export const defineActionScroll = (
  scroll: ScrollInputPrimitives['scroll'],
): DeviceAction<ActionScrollParam> => {
  return defineAction<typeof actionScrollParamSchema, ActionScrollParam>({
    name: 'Scroll',
    description:
      'Scroll the page or a scrollable element to browse content. This is the preferred way to scroll on all platforms, including mobile. Supports scrollToBottom/scrollToTop for boundary navigation. Default: direction `down`, scrollType `singleAction`, distance `null`.',
    interfaceAlias: 'aiScroll',
    paramSchema: actionScrollParamSchema,
    sample: {
      direction: 'down',
      scrollType: 'singleAction',
      locate: { prompt: 'the center of the product list area' },
    },
    call: async (param) => {
      await scroll(param);
    },
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
  dragAndDrop: NonNullable<PointerInputPrimitives['dragAndDrop']>,
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
    sample: {
      from: { prompt: 'the "report.pdf" file icon' },
      to: { prompt: 'the upload drop zone' },
    },
    call: async (param) => {
      const from = param.from;
      const to = param.to;
      if (!from) {
        throw new Error('missing "from" param for drag and drop');
      }
      if (!to) {
        throw new Error('missing "to" param for drag and drop');
      }
      await dragAndDrop(
        { x: from.center[0], y: from.center[1] },
        { x: to.center[0], y: to.center[1] },
      );
    },
  });
};

export const ActionLongPressParamSchema = z.object({
  locate: getMidsceneLocationSchema().describe(
    'The element to be long pressed',
  ),
  duration: z
    .number()
    .optional()
    .describe('Long press duration in milliseconds'),
});

export type ActionLongPressParam = {
  locate: LocateResultElement;
  duration?: number;
};
export const defineActionLongPress = (
  longPress: NonNullable<PointerInputPrimitives['longPress']>,
): DeviceAction<ActionLongPressParam> => {
  return defineLocatedPointAction<
    typeof ActionLongPressParamSchema,
    ActionLongPressParam
  >({
    name: 'LongPress',
    description: 'Long press the element',
    interfaceAlias: 'aiLongPress',
    paramSchema: ActionLongPressParamSchema,
    sample: {
      locate: { prompt: 'the message bubble' },
    },
    missingLocateMessage: 'LongPress requires an element to be located',
    call: async (point, param) => {
      await longPress(point, { duration: param.duration });
    },
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

export const defineActionSwipe = (config: {
  swipe: TouchInputPrimitives['swipe'];
  size(): Promise<Size>;
}): DeviceAction<ActionSwipeParam> => {
  return defineAction<typeof ActionSwipeParamSchema, ActionSwipeParam>({
    name: 'Swipe',
    description:
      'Perform a touch gesture for interactions beyond regular scrolling (e.g., flip pages in a carousel, dismiss a notification, swipe-to-delete a list item). For regular content scrolling, use Scroll instead. Use "distance" + "direction" for relative movement, or "end" for precise endpoint.',
    paramSchema: ActionSwipeParamSchema,
    sample: {
      start: { prompt: 'center of the notification' },
      end: { prompt: 'upper edge of the screen' },
    },
    call: async (param) => {
      const { startPoint, endPoint, duration, repeatCount } =
        normalizeMobileSwipeParam(param, await config.size());
      for (let i = 0; i < repeatCount; i++) {
        await config.swipe(startPoint, endPoint, { duration });
      }
    },
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
  clearInput: KeyboardInputPrimitives['clearInput'],
): DeviceAction<ActionClearInputParam> => {
  return defineAction<
    typeof actionClearInputParamSchema,
    ActionClearInputParam
  >({
    name: 'ClearInput',
    description: inputLocateDescription,
    interfaceAlias: 'aiClearInput',
    paramSchema: actionClearInputParamSchema,
    sample: {
      locate: { prompt: 'the search input field' },
    },
    call: async (param) => {
      await clearInput(param.locate);
    },
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

export const defineActionCursorMove = (config: {
  keyboard: Pick<KeyboardInputPrimitives, 'keyboardPress' | 'cursorMove'>;
  sleep?(timeMs: number): Promise<void>;
}): DeviceAction<ActionCursorMoveParam> => {
  return defineAction<
    typeof actionCursorMoveParamSchema,
    ActionCursorMoveParam
  >({
    name: 'CursorMove',
    description:
      'Move the text cursor (caret) left or right within an input field or text area. Use this to reposition the cursor without selecting text.',
    paramSchema: actionCursorMoveParamSchema,
    sample: {
      direction: 'left',
      times: 3,
    },
    call: async (param) => {
      const times = param.times ?? 1;
      if (config.keyboard.cursorMove) {
        await config.keyboard.cursorMove(param.direction, times);
        return;
      }

      const wait =
        config.sleep ??
        ((timeMs: number) =>
          new Promise<void>((resolve) => setTimeout(resolve, timeMs)));
      const arrowKey = param.direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
      for (let i = 0; i < times; i++) {
        await config.keyboard.keyboardPress(arrowKey);
        await wait(100);
      }
    },
  });
};

// Pinch
export const ActionPinchParamSchema = z.object({
  locate: getMidsceneLocationSchema()
    .optional()
    .describe(
      'The element to pinch on. If not specified, the center of the screen will be used',
    ),
  direction: z
    .enum(['in', 'out'])
    .describe(
      'Pinch direction. "in" = pinch fingers together (zoom out / shrink), "out" = spread fingers apart (zoom in / enlarge).',
    ),
  distance: z
    .number()
    .positive()
    .optional()
    .describe(
      'How far each finger moves in pixels. Defaults to a quarter of the shorter screen dimension.',
    ),
  duration: z
    .number()
    .default(500)
    .optional()
    .describe('Duration of the pinch gesture in milliseconds'),
});

export type ActionPinchParam = {
  locate?: LocateResultElement;
  direction: 'in' | 'out';
  distance?: number;
  duration?: number;
};

export const defineActionPinch = (config: {
  pinch: TouchInputPrimitives['pinch'];
  size(): Promise<Size>;
}): DeviceAction<ActionPinchParam> | undefined => {
  if (!config.pinch) {
    return undefined;
  }

  return defineAction<typeof ActionPinchParamSchema, ActionPinchParam>({
    name: 'Pinch',
    description:
      'Perform a two-finger pinch gesture. Use direction "in" to pinch fingers together (zoom out), or "out" to spread fingers apart (zoom in). Optionally specify distance for how far each finger moves.',
    interfaceAlias: 'aiPinch',
    paramSchema: ActionPinchParamSchema,
    sample: {
      locate: { prompt: 'the map area' },
      direction: 'out',
      distance: 200,
    },
    call: async (param) => {
      const { centerX, centerY, startDistance, endDistance, duration } =
        normalizePinchParam(param, await config.size());
      await config.pinch?.(
        { x: centerX, y: centerY },
        { startDistance, endDistance, duration },
      );
    },
  });
};

export function normalizePinchParam(
  param: ActionPinchParam,
  screenSize: { width: number; height: number },
): {
  centerX: number;
  centerY: number;
  startDistance: number;
  endDistance: number;
  duration: number;
} {
  const { width, height } = screenSize;
  const element = param.locate;
  const centerX = element
    ? Math.round(element.center[0])
    : Math.round(width / 2);
  const centerY = element
    ? Math.round(element.center[1])
    : Math.round(height / 2);
  const duration = param.duration ?? 500;

  const baseDistance = Math.round(Math.min(width, height) / 4);
  const fingerDistance = param.distance ?? baseDistance;

  const startDistance = baseDistance;
  const endDistance =
    param.direction === 'out'
      ? baseDistance + fingerDistance
      : Math.max(10, baseDistance - fingerDistance);

  return { centerX, centerY, startDistance, endDistance, duration };
}

export interface MobileInputActionContext {
  input: MobileInputPrimitives;
  size(): Promise<Size>;
  sleep?(timeMs: number): Promise<void>;
  getDefaultAutoDismissKeyboard?(): boolean | undefined;
  systemActions?: SystemInputActionOptions;
}

export interface SystemInputActionConfig {
  name: string;
  description: string;
  interfaceAlias?: string;
  delayBeforeRunner?: number;
  delayAfterRunner?: number;
}

export interface SystemInputActionOptions {
  backButton?: SystemInputActionConfig;
  homeButton?: SystemInputActionConfig;
  recentAppsButton?: SystemInputActionConfig;
}

export interface InputPrimitiveActionOptions {
  size?: () => Promise<Size>;
  sleep?: (timeMs: number) => Promise<void>;
  includeSwipe?: boolean;
  includePinch?: boolean;
  systemActions?: SystemInputActionOptions;
}

function defineSystemInputAction(
  config: SystemInputActionConfig,
  call: () => Promise<void>,
): DeviceAction<undefined, void> {
  return defineAction<undefined, undefined, void>({
    name: config.name,
    description: config.description,
    interfaceAlias: config.interfaceAlias,
    delayBeforeRunner: config.delayBeforeRunner,
    delayAfterRunner: config.delayAfterRunner,
    call,
  });
}

export function defineActionsFromInputPrimitives(
  input: InputPrimitives,
  options: InputPrimitiveActionOptions = {},
): DeviceAction<any>[] {
  const actions: Array<DeviceAction<any> | undefined> = [];
  const { pointer, keyboard, scroll, touch, system } = input;

  if (pointer) {
    actions.push(defineActionTap(pointer.tap));
    if (pointer.doubleClick) {
      actions.push(defineActionDoubleClick(pointer.doubleClick));
    }
    if (pointer.rightClick) {
      actions.push(defineActionRightClick(pointer.rightClick));
    }
    if (pointer.hover) {
      actions.push(defineActionHover(pointer.hover));
    }
    if (pointer.dragAndDrop) {
      actions.push(defineActionDragAndDrop(pointer.dragAndDrop));
    }
    if (pointer.longPress) {
      actions.push(defineActionLongPress(pointer.longPress));
    }
  }

  if (keyboard) {
    actions.push(
      defineActionInput(keyboard),
      defineActionClearInput(keyboard.clearInput),
      defineActionKeyboardPress(keyboard.keyboardPress),
      defineActionCursorMove({ keyboard, sleep: options.sleep }),
    );
  }

  if (scroll) {
    actions.push(defineActionScroll(scroll.scroll));
  }

  if (touch?.swipe && options.size && options.includeSwipe !== false) {
    actions.push(defineActionSwipe({ swipe: touch.swipe, size: options.size }));
  }

  if (touch?.pinch && options.size && options.includePinch !== false) {
    actions.push(defineActionPinch({ pinch: touch.pinch, size: options.size }));
  }

  if (system && options.systemActions) {
    const { systemActions } = options;
    if (system.backButton && systemActions.backButton) {
      actions.push(
        defineSystemInputAction(systemActions.backButton, system.backButton),
      );
    }
    if (system.homeButton && systemActions.homeButton) {
      actions.push(
        defineSystemInputAction(systemActions.homeButton, system.homeButton),
      );
    }
    if (system.recentAppsButton && systemActions.recentAppsButton) {
      actions.push(
        defineSystemInputAction(
          systemActions.recentAppsButton,
          system.recentAppsButton,
        ),
      );
    }
  }

  return actions.filter((action): action is DeviceAction<any> =>
    Boolean(action),
  );
}

export function createDefaultMobileActions(
  context: MobileInputActionContext,
): DeviceAction<any>[] {
  return defineActionsFromInputPrimitives(context.input, {
    size: context.size,
    sleep: context.sleep,
    systemActions: context.systemActions,
  });
}

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
    sample: {
      timeMs: 2000,
    },
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
  HarmonyDeviceOpt,
  HarmonyDeviceInputOpt,
} from './device-options';
