import type { AbstractPage } from '@/page';
import type { BaseElement, Rect, UIContext } from '@midscene/core';
import type { NodeType } from '@midscene/shared/constants';
import { traverseTree } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import { _keyDefinitions } from '@midscene/shared/us-keyboard-layout';
import { commonContextParser } from './common/utils';

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

export type WebUIContext = UIContext<WebElementInfo>;

const debug = getDebug('web:parse-context');
export async function WebPageContextParser(
  page: AbstractPage,
  _opt?: any, // unused
): Promise<UIContext> {
  const basicContext = await commonContextParser(page);

  debug('Traversing element tree');
  const tree = await page.getElementsNodeTree();
  const webTree = traverseTree(tree!, (elementInfo) => {
    const { rect, id, content, attributes, indexId, isVisible } = elementInfo;
    return new WebElementInfo({
      rect,
      id,
      content,
      attributes,
      indexId,
      isVisible,
    });
  });
  debug('TraverseTree end');

  return {
    ...basicContext,
    tree: webTree,
  };
}
