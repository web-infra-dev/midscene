import type { LocateResultElement, Rect } from '@midscene/core';

const REPORT_HIGHLIGHT_EDGE_SIZE = 8;

export const getCenterHighlightBox = (
  element: Pick<LocateResultElement, 'center'>,
): Rect => {
  const centerX = Math.round(element.center[0]);
  const centerY = Math.round(element.center[1]);
  const offset = Math.ceil(REPORT_HIGHLIGHT_EDGE_SIZE / 2) - 1;

  return {
    left: Math.max(centerX - offset, 0),
    top: Math.max(centerY - offset, 0),
    width: REPORT_HIGHLIGHT_EDGE_SIZE,
    height: REPORT_HIGHLIGHT_EDGE_SIZE,
  };
};

export const normalizeHighlightElementForReport = (
  element: LocateResultElement,
): LocateResultElement => {
  return {
    ...element,
    center: [Math.round(element.center[0]), Math.round(element.center[1])],
    rect: getCenterHighlightBox(element),
  };
};
