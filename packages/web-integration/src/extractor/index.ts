import type { NodeType } from '@midscene/shared/constants';

export interface ElementInfo {
  id: string;
  indexId: number;
  nodeHashId: string;
  locator: string;
  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
  nodeType: NodeType;
  content: string;
  rect: { left: number; top: number; width: number; height: number };
  center: [number, number];
}

export interface ElementNode {
  node: ElementInfo | null;
  children: ElementNode[];
}

export { extractTextWithPosition as webExtractTextWithPosition } from './web-extractor';

export { extractTextWithPosition as clientExtractTextWithPosition } from './client-extractor';

export { extractTreeNode as webExtractNodeTree } from './web-extractor';
