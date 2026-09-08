import type { LocateResultElement, Rect } from '@midscene/core';

const REPORT_HIGHLIGHT_EDGE_SIZE = 8;

export const getCenterHighlightBox = (
  element: Pick<LocateResultElement, 'center'>,
): Rect => {
  const centerX = element.center[0];
  const centerY = element.center[1];
  const offset = REPORT_HIGHLIGHT_EDGE_SIZE / 2;

  return {
    left: centerX - offset,
    top: centerY - offset,
    width: REPORT_HIGHLIGHT_EDGE_SIZE,
    height: REPORT_HIGHLIGHT_EDGE_SIZE,
  };
};
