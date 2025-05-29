import type { NodeType } from '../constants';
import type { ElementInfo } from '../extractor';

export interface Point {
  left: number;
  top: number;
}

export interface Size {
  width: number; // device independent window size
  height: number;
  dpr?: number; // the scale factor of the screenshots
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

  abstract locator?: string;

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
