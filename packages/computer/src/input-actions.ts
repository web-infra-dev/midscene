import type { DeviceAction } from '@midscene/core';
import {
  type InputPrimitives,
  defineActionClearInput,
  defineActionDoubleClick,
  defineActionDragAndDrop,
  defineActionHover,
  defineActionInput,
  defineActionKeyboardPress,
  defineActionRightClick,
  defineActionScroll,
  defineActionTap,
} from '@midscene/core/device';

export interface ComputerInputActionContext {
  input: InputPrimitives;
}

export function createComputerTapAction(
  context: ComputerInputActionContext,
): DeviceAction {
  return defineActionTap(context.input);
}

export function createComputerDoubleClickAction(
  context: ComputerInputActionContext,
) {
  return defineActionDoubleClick(context.input);
}

export function createComputerRightClickAction(
  context: ComputerInputActionContext,
) {
  return defineActionRightClick(context.input);
}

export function createComputerHoverAction(context: ComputerInputActionContext) {
  return defineActionHover(context.input);
}

export function createComputerInputAction(context: ComputerInputActionContext) {
  return defineActionInput(context.input);
}

export function createComputerScrollAction(
  context: ComputerInputActionContext,
) {
  return defineActionScroll(context.input);
}

export function createComputerKeyboardPressAction(
  context: ComputerInputActionContext,
) {
  return defineActionKeyboardPress(context.input);
}

export function createComputerDragAndDropAction(
  context: ComputerInputActionContext,
) {
  return defineActionDragAndDrop(context.input);
}

export function createComputerClearInputAction(
  context: ComputerInputActionContext,
) {
  return defineActionClearInput(context.input);
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
