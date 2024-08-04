import type { BaseElement, Rect } from '@midscene/core';
import type { WebPage } from './common/page';
import type { NodeType } from './extractor/constants';

export interface WebElementInfoType extends BaseElement {
  id: string;
  locator: string;
  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
}

export class WebElementInfo implements BaseElement {
  content: string;

  locator: string;

  rect: Rect;

  center: [number, number];

  page: WebPage;

  id: string;

  attributes: {
    nodeType: NodeType;
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
    page: WebPage;
    locator: string;
    id: string;
    attributes: {
      nodeType: NodeType;
      [key: string]: string;
    };
  }) {
    this.content = content;
    this.rect = rect;
    this.center = [
      Math.floor(rect.left + rect.width / 2),
      Math.floor(rect.top + rect.height / 2),
    ];
    this.page = page;
    this.locator = locator;
    this.id = id;
    this.attributes = attributes;
  }
}
