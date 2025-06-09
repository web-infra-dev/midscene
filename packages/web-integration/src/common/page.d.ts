import type { ElementTreeNode } from '@midscene/core';
import type { PageType, Point, Size } from '@midscene/core';
import type { ElementInfo } from '@midscene/shared/extractor';
import type { KeyInput } from 'puppeteer';
import type ChromeExtensionProxyPage from '../chrome-extension/page';
import type { AbstractPage } from '../page';
import type { StaticPage } from '../playground';
import type { PlaywrightWebPage } from '../playwright';
import type { PuppeteerWebPage } from '../puppeteer';

export interface AndroidDevicePage extends AbstractPage {
  pageType: PageType;
  connect(): Promise<any>;
  launch(uri: string): Promise<any>;

  screenshotBase64(): Promise<string>;
  screenshotBlob(): Promise<Blob>;
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
  getElementInfoByXpath(xpath: string): Promise<ElementInfo>;

  back(): Promise<void>;
  home(): Promise<void>;
  recentApps(): Promise<void>;
}

export type AndroidDeviceInputOpt = {
  autoDismissKeyboard?: boolean;
};

export type WebPage =
  | PlaywrightWebPage
  | PuppeteerWebPage
  | StaticPage
  | ChromeExtensionProxyPage
  | AndroidDevicePage;

export type WebKeyInput = KeyInput;
