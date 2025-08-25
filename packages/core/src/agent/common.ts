import type { AbstractPage } from '@/device';
import type { DeviceAction } from '@/index';
import { getMidsceneLocationSchema, z } from '@/index';
import { sleep } from '@/utils';
import type { ElementInfo } from '@midscene/shared/extractor';
import { _keyDefinitions } from '@midscene/shared/us-keyboard-layout';
import { assert } from '@midscene/shared/utils';
import { getKeyCommands } from './ui-utils';

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
const actionTapParamSchema = z.object({
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
const actionRightClickParamSchema = z.object({
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

// Hover
const actionHoverParamSchema = z.object({
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
const actionInputParamSchema = z.object({
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
const actionKeyboardPressParamSchema = z.object({
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
const actionScrollParamSchema = z.object({
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
const actionDragAndDropParamSchema = z.object({
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

export const commonWebActionsForWebPage = <T extends AbstractPage>(
  page: T,
): DeviceAction<any>[] => [
  defineActionTap(async (param) => {
    const element = param.locate;
    assert(element, 'Element not found, cannot tap');
    await page.mouse.click(element.center[0], element.center[1], {
      button: 'left',
    });
  }),
  defineActionRightClick(async (param) => {
    const element = param.locate;
    assert(element, 'Element not found, cannot right click');
    await page.mouse.click(element.center[0], element.center[1], {
      button: 'right',
    });
  }),
  defineActionHover(async (param) => {
    const element = param.locate;
    assert(element, 'Element not found, cannot hover');
    await page.mouse.move(element.center[0], element.center[1]);
  }),
  defineActionInput(async (param) => {
    const element = param.locate;
    if (element) {
      await page.clearInput(element as unknown as ElementInfo);

      if (!param || !param.value) {
        return;
      }
    }

    // Note: there is another implementation in AndroidDevicePage, which is more complex
    await page.keyboard.type(param.value);
  }),
  defineActionKeyboardPress(async (param) => {
    const element = param.locate;
    if (element) {
      await page.mouse.click(element.center[0], element.center[1], {
        button: 'left',
      });
    }

    const keys = getKeyCommands(param.keyName);
    await page.keyboard.press(keys as any); // TODO: fix this type error
  }),
  defineActionScroll(async (param) => {
    const element = param.locate;
    const startingPoint = element
      ? {
          left: element.center[0],
          top: element.center[1],
        }
      : undefined;
    const scrollToEventName = param?.scrollType;
    if (scrollToEventName === 'untilTop') {
      await page.scrollUntilTop(startingPoint);
    } else if (scrollToEventName === 'untilBottom') {
      await page.scrollUntilBottom(startingPoint);
    } else if (scrollToEventName === 'untilRight') {
      await page.scrollUntilRight(startingPoint);
    } else if (scrollToEventName === 'untilLeft') {
      await page.scrollUntilLeft(startingPoint);
    } else if (scrollToEventName === 'once' || !scrollToEventName) {
      if (param?.direction === 'down' || !param || !param.direction) {
        await page.scrollDown(param?.distance || undefined, startingPoint);
      } else if (param.direction === 'up') {
        await page.scrollUp(param.distance || undefined, startingPoint);
      } else if (param.direction === 'left') {
        await page.scrollLeft(param.distance || undefined, startingPoint);
      } else if (param.direction === 'right') {
        await page.scrollRight(param.distance || undefined, startingPoint);
      } else {
        throw new Error(`Unknown scroll direction: ${param.direction}`);
      }
      // until mouse event is done
      await sleep(500);
    } else {
      throw new Error(
        `Unknown scroll event type: ${scrollToEventName}, param: ${JSON.stringify(
          param,
        )}`,
      );
    }
  }),
  defineActionDragAndDrop(async (param) => {
    const from = param.from;
    const to = param.to;
    assert(from, 'missing "from" param for drag and drop');
    assert(to, 'missing "to" param for drag and drop');
    await page.mouse.drag(
      {
        x: from.center[0],
        y: from.center[1],
      },
      {
        x: to.center[0],
        y: to.center[1],
      },
    );
  }),
];
