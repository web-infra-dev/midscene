import type { BaseElement, Rect } from '@midscene/core';
import type { NodeType } from '@midscene/shared/constants';
export interface WebElementInfoType extends BaseElement {
  id: string;
  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
}

export class WebElementInfo implements BaseElement {
  content: string;

  rect: Rect;

  center: [number, number];

  id: string;

  indexId: number;

  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };

  xpaths?: string[];

  isVisible: boolean;

  constructor({
    content,
    rect,
    id,
    attributes,
    indexId,
    xpaths,
    isVisible,
  }: {
    content: string;
    rect: Rect;
    id: string;
    attributes: {
      nodeType: NodeType;
      [key: string]: string;
    };
    indexId: number;
    xpaths?: string[];
    isVisible: boolean;
  }) {
    this.content = content;
    this.rect = rect;
    this.center = [
      Math.floor(rect.left + rect.width / 2),
      Math.floor(rect.top + rect.height / 2),
    ];
    this.id = id;
    this.attributes = attributes;
    this.indexId = indexId;
    this.xpaths = xpaths;
    this.isVisible = isVisible;
  }
}
