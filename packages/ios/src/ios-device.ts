import type { ElementTreeNode, PageType, Point, Size } from '@midscene/core';
import type { AbstractPage } from '@midscene/core/device';
import type { ElementInfo } from '@midscene/shared/extractor';

export type IOSDeviceInputOpt = {
  autoDismissKeyboard?: boolean;
};

export interface IOSDevicePage extends AbstractPage {
  pageType: PageType;
  connect(): Promise<any>;
  launch(uri: string): Promise<any>;

  screenshotBase64(): Promise<string>;
  getElementsNodeTree(): Promise<ElementTreeNode<ElementInfo>>;
  url(): string | Promise<string>;
  size(): Promise<Size>;

  scrollUntilTop(startingPoint?: Point): Promise<void>;
  scrollUntilBottom(startingPoint?: Point): Promise<void>;
  scrollUntilLeft(startingPoint?: Point): Promise<void>;
  scrollUntilRight(startingPoint?: Point): Promise<void>;
  scrollUp(distance?: number, startingPoint?: Point): Promise<void>;
  scrollDown(distance?: number, startingPoint?: Point): Promise<void>;
  scrollLeft(distance?: number, startingPoint?: Point): Promise<void>;
  scrollRight(distance?: number): Promise<void>;

  getXpathsById(id: string): Promise<string[]>;
  getXpathsByPoint(point: Point, isOrderSensitive: boolean): Promise<string[]>;
  getElementInfoByXpath(xpath: string): Promise<ElementInfo>;

  back(): Promise<void>;
  home(): Promise<void>;
  recentApps(): Promise<void>;
  longPress(x: number, y: number, duration?: number): Promise<void>;
  pullDown(
    startPoint?: Point,
    distance?: number,
    duration?: number,
  ): Promise<void>;
  pullUp(
    startPoint?: Point,
    distance?: number,
    duration?: number,
  ): Promise<void>;
}
