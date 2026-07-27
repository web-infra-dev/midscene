import type { UiNode } from '@midscene/core/internal/device-cache';

export type AndroidAccessibilityTreeSource = 'yadb' | 'uiautomator';

export interface AndroidAccessibilitySnapshot {
  captureId: string;
  capturedAt: string;
  durationMs: number;
  source: AndroidAccessibilityTreeSource;
  sourceXml: string;
  root: UiNode;
  dpr: number;
  rotation: number;
  logicalSize: {
    width: number;
    height: number;
  };
}
