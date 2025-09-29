import type { NodeType } from '../constants';
import type { ElementInfo } from '../extractor';

export interface Point {
  left: number;
  top: number;
}

export interface Size {
  width: number; // logical pixel size
  height: number;
  dpr?: number; // dpr is the ratio of the physical pixel to the logical pixel. For example, the dpr is 2 when the screenshotBase64 returned is 2000x1000 when the logical width and height are 1000x500 here. Overriding the dpr will affect how the screenshotBase64 is resized before being sent to the AI model.
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
