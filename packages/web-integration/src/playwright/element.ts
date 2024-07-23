import { Page } from 'playwright';
import { BaseElement, Rect } from '@midscene/core';
import { NodeType } from '../html-element/constants';

export interface WebElementInfoType extends BaseElement {
  id: string;
  locator: string;
  attributes: {
    ['nodeType']: NodeType;
    [key: string]: string;
  };
}

export class WebElementInfo implements BaseElement {
  content: string;

  locator: string;

  rect: Rect;

  center: [number, number];

  page: Page;

  id: string;

  attributes: {
    ['nodeType']: NodeType;
    [key: string]: string;
  };

  constructor({
    content,
    rect,
    page,
    locator,
    id,
    attributes,
  }: {
    content: string;
    rect: Rect;
    page: Page;
    locator: string;
    id: string;
    attributes: {
      ['nodeType']: NodeType;
      [key: string]: string;
    };
  }) {
    this.content = content;
    this.rect = rect;
    this.center = [Math.floor(rect.left + rect.width / 2), Math.floor(rect.top + rect.height / 2)];
    this.page = page;
    this.locator = locator;
    this.id = id;
    this.attributes = attributes;
  }

  async tap() {
    await this.page.mouse.click(this.center[0], this.center[1]);
  }

  async hover() {
    await this.page.mouse.move(this.center[0], this.center[1]);
  }

  async type(text: string) {
    await this.page.keyboard.type(text);
  }

  async press(key: Parameters<typeof this.page.keyboard.press>[0]) {
    await this.page.keyboard.press(key);
  }
}
