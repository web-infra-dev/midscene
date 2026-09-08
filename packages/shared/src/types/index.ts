import type { NodeType } from '../constants';
import type { ElementInfo } from '../extractor';

export interface Point {
  left: number;
  top: number;
}

export interface Size {
  width: number; // The image sent to AI model will be resized to this width, also the coordinates in the action space will be scaled to the range [0, width]. Usually you should set it to the logical pixel size
  height: number; // The image sent to AI model will be resized to this height, also the coordinates in the action space will be scaled to the range [0, height]. Usually you should set it to the logical pixel size
}

export type Rect = Point & Size;

export abstract class BaseElement {
  abstract id: string;

  // abstract indexId?: number; // markerId for web

  abstract attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };

  abstract content: string;

  abstract rect: Rect;

  abstract center: [number, number];

  // abstract xpaths?: string[];

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

export type LocateResultElement = {
  description: string; // the description of the element
  /**
   * Authoritative target point in original screenshot coordinates.
   * For model results, first take the midpoint of the raw bbox (or use the raw
   * point), then map that point to the original screenshot. Normalized coordinates
   * are rounded during pixel mapping. Never derive it from the mapped rect: minimizing coordinate
   * conversions avoids unnecessary precision loss. Convert this center to
   * device coordinates when computing the final click point.
   */
  center: [number, number];
  /**
   * Preserves the mapped original model bbox or an intermediate bbox from the
   * DeepLocate pipeline. Used only as region metadata for DeepLocate cropping;
   * never use it to compute a click point or recompute center. Click coordinates
   * must be calculated directly from the already resolved center.
   */
  rect?: Rect;
  /**
   * Web-only compatibility field returned by `Agent.aiLocate()`.
   * It is the ratio between physical screenshot pixels and logical CSS pixels.
   */
  dpr?: number;
};
