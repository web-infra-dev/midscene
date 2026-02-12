import type { DeviceAction, Point, UIContext } from '@midscene/core';
import type { AbstractInterface } from '@midscene/core/device';
import {
  defineActionDragAndDrop,
  defineActionHover,
  defineActionInput,
  defineActionKeyboardPress,
  defineActionRightClick,
  defineActionScroll,
  defineActionSwipe,
  defineActionTap,
} from '@midscene/core/device';
import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '@midscene/shared/common';


const ThrowNotImplemented = (methodName: string) => {
  throw new Error(
    `The method "${methodName}" is not implemented as designed since this is a static UI context. (${ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED})`,
  );
};

type StaticPageUIContext = Omit<UIContext, 'deprecatedDpr'>;

export default class StaticPage implements AbstractInterface {
  interfaceType = 'static';

  private uiContext: StaticPageUIContext;

  constructor(uiContext: StaticPageUIContext) {
    this.uiContext = uiContext;
  }

  actionSpace(): DeviceAction[] {
    // Return available actions for static page - they will throw "not implemented" errors when executed
    // but need to be available for planning phase
    return [
      defineActionTap(async (param) => {
        ThrowNotImplemented('Tap');
      }),
      defineActionRightClick(async (param) => {
        ThrowNotImplemented('RightClick');
      }),
      defineActionHover(async (param) => {
        ThrowNotImplemented('Hover');
      }),
      defineActionInput(async (param) => {
        ThrowNotImplemented('Input');
      }),
      defineActionKeyboardPress(async (param) => {
        ThrowNotImplemented('KeyboardPress');
      }),
      defineActionScroll(async (param) => {
        ThrowNotImplemented('Scroll');
      }),
      defineActionDragAndDrop(async (param) => {
        ThrowNotImplemented('DragAndDrop');
      }),
      defineActionSwipe(async (param) => {
        ThrowNotImplemented('Swipe');
      }),
    ];
  }

  async evaluateJavaScript<T = unknown>(script: string): Promise<T> {
    return ThrowNotImplemented('evaluateJavaScript');
  }

  // @deprecated
  async getElementsInfo() {
    return ThrowNotImplemented('getElementsInfo');
  }

  async getElementsNodeTree() {
    return ThrowNotImplemented('getElementsNodeTree');
  }

  async getXpathsByPoint(point: Point) {
    return ThrowNotImplemented('getXpathsByPoint');
  }

  async getElementInfoByXpath(xpath: string) {
    return ThrowNotImplemented('getElementInfoByXpath');
  }

  async size() {
    return {
      ...this.uiContext.shotSize
    };
  }

  async screenshotBase64() {
    const screenshot = this.uiContext.screenshot;
    if (typeof screenshot === 'object' && 'base64' in screenshot) {
      return (screenshot as { base64: string }).base64;
    }
    return screenshot as unknown as string;
  }

  async url() {
    return Promise.resolve('https://static_page_without_url');
  }

  async scrollUntilTop(startingPoint?: Point) {
    return ThrowNotImplemented('scrollUntilTop');
  }

  async scrollUntilBottom(startingPoint?: Point) {
    return ThrowNotImplemented('scrollUntilBottom');
  }

  async scrollUntilLeft(startingPoint?: Point) {
    return ThrowNotImplemented('scrollUntilLeft');
  }

  async scrollUntilRight(startingPoint?: Point) {
    return ThrowNotImplemented('scrollUntilRight');
  }

  async scrollUp(distance?: number, startingPoint?: Point) {
    return ThrowNotImplemented('scrollUp');
  }

  async scrollDown(distance?: number, startingPoint?: Point) {
    return ThrowNotImplemented('scrollDown');
  }

  async scrollLeft(distance?: number, startingPoint?: Point) {
    return ThrowNotImplemented('scrollLeft');
  }

  async scrollRight(distance?: number, startingPoint?: Point) {
    return ThrowNotImplemented('scrollRight');
  }

  async clearInput() {
    return ThrowNotImplemented('clearInput');
  }

  mouse = {
    click: ThrowNotImplemented.bind(null, 'mouse.click'),
    wheel: ThrowNotImplemented.bind(null, 'mouse.wheel'),
    move: ThrowNotImplemented.bind(null, 'mouse.move'),
    drag: ThrowNotImplemented.bind(null, 'mouse.drag'),
  };

  keyboard = {
    type: ThrowNotImplemented.bind(null, 'keyboard.type'),
    press: ThrowNotImplemented.bind(null, 'keyboard.press'),
  };

  async destroy(): Promise<void> {
    //
  }

  updateContext(newContext: StaticPageUIContext): void {
    this.uiContext = newContext;
  }
}
