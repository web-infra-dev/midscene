import type {
  ElementCacheFeature,
  ElementTreeNode,
  Rect,
  Size,
} from '@midscene/core';
import type { ElementInfo } from '@midscene/shared/extractor';
import type { KeyInput, MouseButton } from '../web-page';

export type VirtualWebSurfaceAction =
  | {
      type: 'mouse.click';
      x: number;
      y: number;
      button: MouseButton;
      count: number;
    }
  | { type: 'mouse.wheel'; deltaX: number; deltaY: number }
  | { type: 'mouse.move'; x: number; y: number }
  | {
      type: 'mouse.drag';
      from: { x: number; y: number };
      to: { x: number; y: number };
    }
  | { type: 'keyboard.type'; text: string; delay?: number }
  | {
      type: 'keyboard.press';
      keys: Array<{ key: KeyInput; command?: string }>;
    }
  | { type: 'keyboard.down'; key: KeyInput }
  | { type: 'keyboard.up'; key: KeyInput }
  | { type: 'input.clear'; element?: ElementInfo }
  | { type: 'navigation.navigate'; url: string }
  | { type: 'navigation.reload' }
  | { type: 'navigation.goBack' }
  | { type: 'navigation.goForward' }
  | {
      type: 'gesture.swipe';
      from: { x: number; y: number };
      to: { x: number; y: number };
      duration: number;
    }
  | { type: 'gesture.longPress'; x: number; y: number; duration: number }
  | {
      type: 'gesture.pinch';
      centerX: number;
      centerY: number;
      startDistance: number;
      endDistance: number;
      duration: number;
    };

/**
 * The minimum page-like contract presented to an Agent while the real page is
 * temporarily unavailable (for example, while a native browser dialog pauses
 * its JavaScript execution context).
 */
export interface VirtualWebSurface {
  size(): Promise<Size>;
  screenshotBase64(): Promise<string>;
  getElementsNodeTree(): Promise<ElementTreeNode<ElementInfo>>;
  cacheFeatureForPoint(center: [number, number]): Promise<ElementCacheFeature>;
  rectMatchesCacheFeature(feature: ElementCacheFeature): Promise<Rect>;
  dispatchAction(action: VirtualWebSurfaceAction): Promise<void>;
}
