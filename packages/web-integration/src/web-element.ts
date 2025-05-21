import type { BaseElement, Rect } from '@midscene/core';
import type { NodeType } from '@midscene/shared/constants';
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

  locator?: string;

  rect: Rect;

  center: [number, number];

  // page: WebPage;

  id: string;

  indexId: number;

  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };

  xpaths?: string[];

  constructor({
    content,
    rect,
    // page,
    locator,
    id,
    attributes,
    indexId,
    xpaths,
  }: {
    content: string;
    rect: Rect;
    // page: WebPage;
    locator?: string;
    id: string;
    attributes: {
      nodeType: NodeType;
      [key: string]: string;
    };
    indexId: number;
    xpaths?: string[];
  }) {
    this.content = content;
    this.rect = rect;
    this.center = [
      Math.floor(rect.left + rect.width / 2),
      Math.floor(rect.top + rect.height / 2),
    ];
    // this.page = page;
    this.locator = locator;
    this.id = id;
    this.attributes = attributes;
    this.indexId = indexId;
    this.xpaths = xpaths;
  }
}
