import type { DeviceAction } from '@/index';
import { getMidsceneLocationSchema, z } from '@/index';
import type { ElementNode } from '@midscene/shared/extractor';
import { _keyDefinitions } from '@midscene/shared/us-keyboard-layout';
import type { Size, UIContext } from '../types';

export abstract class AbstractInterface {
  abstract interfaceType: string;

  abstract screenshotBase64(): Promise<string>;
  abstract size(): Promise<Size>;
  abstract actionSpace(): DeviceAction[] | Promise<DeviceAction[]>;

  abstract destroy(): Promise<void>;

  abstract describe?(): string;
  abstract getElementsNodeTree?: () => Promise<ElementNode>;
  abstract url?: () => string | Promise<string>;
  abstract evaluateJavaScript?<T = any>(script: string): Promise<T>;
  abstract beforeAction?(): Promise<void>;
  abstract getContext?(): Promise<UIContext>;
}

// Generic function to define actions with proper type inference
export const defineAction = <TSchema extends z.ZodType>(
  config: {
    name: string;
    description: string;
    interfaceAlias?: string;
    paramSchema: TSchema;
    call: (param: z.infer<TSchema>) => Promise<void>;
  } & Partial<
    Omit<
      DeviceAction<z.infer<TSchema>>,
      'name' | 'description' | 'interfaceAlias' | 'paramSchema' | 'call'
    >
  >,
): DeviceAction<z.infer<TSchema>> => {
  return config;
};

// Tap
export const actionTapParamSchema = z.object({
  locate: getMidsceneLocationSchema().describe('The element to be tapped'),
});
export type ActionTapParam = z.infer<typeof actionTapParamSchema>;

export const defineActionTap = (
  call: (param: ActionTapParam) => Promise<void>,
): DeviceAction<ActionTapParam> => {
  return defineAction({
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
export type ActionRightClickParam = z.infer<typeof actionRightClickParamSchema>;

export const defineActionRightClick = (
  call: (param: ActionRightClickParam) => Promise<void>,
): DeviceAction<ActionRightClickParam> => {
  return defineAction({
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
export type ActionDoubleClickParam = z.infer<
  typeof actionDoubleClickParamSchema
>;

export const defineActionDoubleClick = (
  call: (param: ActionDoubleClickParam) => Promise<void>,
): DeviceAction<ActionDoubleClickParam> => {
  return defineAction({
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
export type ActionHoverParam = z.infer<typeof actionHoverParamSchema>;

export const defineActionHover = (
  call: (param: ActionHoverParam) => Promise<void>,
): DeviceAction<ActionHoverParam> => {
  return defineAction({
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
  locate: getMidsceneLocationSchema().describe('The element to be input'),
});
export type ActionInputParam = z.infer<typeof actionInputParamSchema>;

export const defineActionInput = (
  call: (param: ActionInputParam) => Promise<void>,
): DeviceAction<ActionInputParam> => {
  return defineAction({
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
export type ActionKeyboardPressParam = z.infer<
  typeof actionKeyboardPressParamSchema
>;

export const defineActionKeyboardPress = (
  call: (param: ActionKeyboardPressParam) => Promise<void>,
): DeviceAction<ActionKeyboardPressParam> => {
  return defineAction({
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
export type ActionScrollParam = z.infer<typeof actionScrollParamSchema>;

export const defineActionScroll = (
  call: (param: ActionScrollParam) => Promise<void>,
): DeviceAction<ActionScrollParam> => {
  return defineAction({
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
export type ActionDragAndDropParam = z.infer<
  typeof actionDragAndDropParamSchema
>;

export const defineActionDragAndDrop = (
  call: (param: ActionDragAndDropParam) => Promise<void>,
): DeviceAction<ActionDragAndDropParam> => {
  return defineAction({
    name: 'DragAndDrop',
    description: 'Drag and drop the element',
    interfaceAlias: 'aiDragAndDrop',
    paramSchema: actionDragAndDropParamSchema,
    call,
  });
};

export type { DeviceAction } from '../types';
