import type { NodeType } from '../constants';
import type { ElementInfo } from '../extractor';

export interface Point {
  left: number;
  top: number;
}

export interface Size {
  width: number; // The image sent to AI model will be resized to this width. usually you should set it to the logical pixel size
  height: number; // The image sent to AI model will be resized to this height. usually you should set it to the logical pixel size
  dpr?: number; // this is deprecated, do NOT use it
}

export type Rect = Point & Size & { zoom?: number };

export abstract class BaseElement {
  abstract id: string;

  abstract indexId?: number; // markerId for web

  abstract attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };

  abstract content: string;

  abstract rect: Rect;

  abstract center: [number, number];

  abstract xpaths?: string[];

  abstract isVisible: boolean;
}

export interface ElementTreeNode<
  ElementType extends BaseElement = BaseElement,
> {
  node: ElementType | null;
  children: ElementTreeNode<ElementType>[];
}

export interface WebElementInfo extends ElementInfo {
  zoom: number;
}
