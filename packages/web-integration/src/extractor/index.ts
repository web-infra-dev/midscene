import type { NodeType } from '@midscene/shared/constants';

export interface ElementInfo {
  id: string;
  indexId?: string; // for debug use
  nodePath: string;
  nodeHashId: string;
  locator: string;
  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
  nodeType: NodeType;
  htmlNode: Node | null;
  content: string;
  rect: { left: number; top: number; width: number; height: number };
  center: [number, number];
}

export { extractTextWithPosition as webExtractTextWithPosition } from './web-extractor';
export { extractTextWithPosition as clientExtractTextWithPosition } from './client-extractor';
