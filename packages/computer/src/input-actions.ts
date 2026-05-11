import type { DeviceAction, LocateResultElement } from '@midscene/core';
import { getMidsceneLocationSchema, z } from '@midscene/core';
import {
  type ActionHoverParam,
  type ActionTapParam,
  type InputPrimitives,
  actionHoverParamSchema,
  defineAction,
  defineActionClearInput,
  defineActionDoubleClick,
  defineActionDragAndDrop,
  defineActionKeyboardPress,
  defineActionRightClick,
  defineActionScroll,
  defineActionTap,
} from '@midscene/core/device';

export interface ComputerInputActionContext {
  input: InputPrimitives;
}

const computerInputParamSchema = z.object({
  value: z.string().describe('The text to input'),
  mode: z
    .enum(['replace', 'clear', 'append'])
    .default('replace')
    .optional()
    .describe('Input mode: replace, clear, or append'),
  locate: getMidsceneLocationSchema()
    .describe('The input field to be filled')
    .optional(),
});

type ComputerInputParam = {
  value: string;
  mode?: 'replace' | 'clear' | 'append';
  locate?: LocateResultElement;
};

export function createComputerTapAction(
  context: ComputerInputActionContext,
): DeviceAction<ActionTapParam> {
  return defineActionTap(async (param: ActionTapParam) => {
    const element = param.locate as LocateResultElement;
    if (!element) {
      throw new Error('Element not found, cannot tap');
    }
    await context.input.pointer!.tap({
      x: element.center[0],
      y: element.center[1],
    });
  });
}

export function createComputerDoubleClickAction(
  context: ComputerInputActionContext,
) {
  return defineActionDoubleClick(async (param) => {
    const element = param.locate as LocateResultElement;
    if (!element) {
      throw new Error('Element not found, cannot double click');
    }
    await context.input.pointer!.doubleClick?.({
      x: element.center[0],
      y: element.center[1],
    });
  });
}

export function createComputerRightClickAction(
  context: ComputerInputActionContext,
) {
  return defineActionRightClick(async (param) => {
    const element = param.locate as LocateResultElement;
    if (!element) {
      throw new Error('Element not found, cannot right click');
    }
    await context.input.pointer!.rightClick?.({
      x: element.center[0],
      y: element.center[1],
    });
  });
}

export function createComputerHoverAction(context: ComputerInputActionContext) {
  return defineAction<typeof actionHoverParamSchema, ActionHoverParam>({
    name: 'MouseMove',
    description: 'Move the mouse to the element',
    interfaceAlias: 'aiHover',
    paramSchema: actionHoverParamSchema,
    sample: {
      locate: { prompt: 'the navigation menu item "Products"' },
    },
    call: async (param) => {
      const element = param.locate as LocateResultElement;
      if (!element) {
        throw new Error('Element not found, cannot move mouse');
      }
      await context.input.pointer!.hover?.({
        x: element.center[0],
        y: element.center[1],
      });
    },
  });
}

export function createComputerInputAction(context: ComputerInputActionContext) {
  return defineAction<typeof computerInputParamSchema, ComputerInputParam>({
    name: 'Input',
    description: 'Input text into the input field',
    interfaceAlias: 'aiInput',
    paramSchema: computerInputParamSchema,
    sample: {
      value: 'test@example.com',
      locate: { prompt: 'the email input field' },
    },
    call: async (param) => {
      if (param.mode === 'clear') {
        if (param.locate) {
          await context.input.keyboard!.clearInput(param.locate);
        }
        return;
      }

      if (!param.value) {
        return;
      }

      await context.input.keyboard!.typeText(param.value, {
        target: param.locate,
        replace: param.mode !== 'append',
      });
    },
  });
}

export function createComputerScrollAction(
  context: ComputerInputActionContext,
) {
  return defineActionScroll(async (param) => {
    await context.input.scroll!.scroll(param);
  });
}

export function createComputerKeyboardPressAction(
  context: ComputerInputActionContext,
) {
  return defineActionKeyboardPress(async (param) => {
    await context.input.keyboard!.keyboardPress(param.keyName, {
      target: param.locate as LocateResultElement | undefined,
    });
  });
}

export function createComputerDragAndDropAction(
  context: ComputerInputActionContext,
) {
  return defineActionDragAndDrop(async (param) => {
    const from = param.from as LocateResultElement;
    const to = param.to as LocateResultElement;
    if (!from) {
      throw new Error('missing "from" param for drag and drop');
    }
    if (!to) {
      throw new Error('missing "to" param for drag and drop');
    }
    await context.input.pointer!.dragAndDrop?.(
      { x: from.center[0], y: from.center[1] },
      { x: to.center[0], y: to.center[1] },
    );
  });
}

export function createComputerClearInputAction(
  context: ComputerInputActionContext,
) {
  return defineActionClearInput(async (param) => {
    await context.input.keyboard!.clearInput(
      param.locate as LocateResultElement,
    );
  });
}

export function createDefaultComputerActions(
  context: ComputerInputActionContext,
): DeviceAction<any>[] {
  return [
    createComputerTapAction(context),
    createComputerDoubleClickAction(context),
    createComputerRightClickAction(context),
    createComputerHoverAction(context),
    createComputerInputAction(context),
    createComputerScrollAction(context),
    createComputerKeyboardPressAction(context),
    createComputerDragAndDropAction(context),
    createComputerClearInputAction(context),
  ];
}
