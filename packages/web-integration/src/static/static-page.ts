import type { DeviceAction, Point, UIContext } from '@midscene/core';
import type { AbstractInterface } from '@midscene/core/device';
import {
  type InputPrimitives,
  defineActionsFromInputPrimitives,
} from '@midscene/core/device';
import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '@midscene/shared/common';

const ThrowNotImplemented = (methodName: string) => {
  throw new Error(
    `The method "${methodName}" is not implemented as designed since this is a static UI context. (${ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED})`,
  );
};

type StaticPageUIContext = Omit<
  UIContext,
  'deprecatedDpr' | 'screenshot'
> & {
  screenshot: unknown;
};

function screenshotBase64FromContext(screenshot: unknown): string {
  if (typeof screenshot === 'string') {
    return screenshot;
  }

  if (!screenshot || typeof screenshot !== 'object') {
    throw new Error('StaticPage screenshot must be a base64 string');
  }

  const record = screenshot as Record<string, unknown>;
  if (typeof record.base64 === 'string') {
    return record.base64;
  }

  // Server-mode report playback sends UIContext through JSON. ScreenshotItem
  // instances lose their getter there, but keep the in-memory payload here.
  if (typeof record._base64 === 'string') {
    return record._base64;
  }

  if (record.type === 'midscene_screenshot_ref') {
    throw new Error(
      'StaticPage screenshot is a serialized reference without base64 data',
    );
  }

  throw new Error(
    'StaticPage screenshot must include base64 data before execution',
  );
}

export default class StaticPage implements AbstractInterface {
  interfaceType = 'static';

  private uiContext: StaticPageUIContext;
  readonly inputPrimitives: InputPrimitives = {
    pointer: {
      tap: async () => ThrowNotImplemented('Tap'),
      rightClick: async () => ThrowNotImplemented('RightClick'),
      hover: async () => ThrowNotImplemented('Hover'),
      dragAndDrop: async () => ThrowNotImplemented('DragAndDrop'),
    },
    keyboard: {
      typeText: async () => ThrowNotImplemented('Input'),
      keyboardPress: async () => ThrowNotImplemented('KeyboardPress'),
      clearInput: async () => ThrowNotImplemented('ClearInput'),
    },
    touch: {
      swipe: async () => ThrowNotImplemented('Swipe'),
    },
    scroll: {
      scroll: async () => ThrowNotImplemented('Scroll'),
    },
  };

  constructor(uiContext: StaticPageUIContext) {
    this.uiContext = uiContext;
  }

  actionSpace(): DeviceAction[] {
    // Return available actions for static page - they will throw "not implemented" errors when executed
    // but need to be available for planning phase
    return defineActionsFromInputPrimitives(this.inputPrimitives, {
      size: () => this.size(),
    });
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
      ...this.uiContext.shotSize,
    };
  }

  async screenshotBase64() {
    return screenshotBase64FromContext(this.uiContext.screenshot);
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
