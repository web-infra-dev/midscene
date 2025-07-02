import type { NodeType } from '../constants/index';

import './patch';

export interface ElementInfo {
  id: string;
  indexId: number;
  nodeHashId: string;
  xpaths?: string[];
  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
  nodeType: NodeType;
  content: string;
  rect: { left: number; top: number; width: number; height: number };
  center: [number, number];
  isVisible: boolean;
}

export interface ElementNode {
  node: ElementInfo | null;
  children: ElementNode[];
}

export {
  descriptionOfTree,
  traverseTree,
  treeToList,
  truncateText,
  trimAttributes,
} from './tree';

export { extractTextWithPosition as webExtractTextWithPosition } from './web-extractor';

export { extractTreeNode as webExtractNodeTree } from './web-extractor';

export { extractTreeNodeAsString as webExtractNodeTreeAsString } from './web-extractor';

export { setNodeHashCacheListOnWindow, getNodeFromCacheList } from './util';

export {
  getXpathsById,
  getNodeInfoByXpath,
  getElementInfoByXpath,
} from './locator';

export { generateElementByPosition } from './dom-util';
