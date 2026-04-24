import type { BaseElement, LocateResultElement, Rect } from '@midscene/core';

type HighlightLikeElement =
  | (Pick<BaseElement, 'center' | 'rect'> &
      Partial<Pick<BaseElement, 'content' | 'id'>>)
  | LocateResultElement;

export interface BlackboardHighlightOverlay {
  key: string;
  label?: string;
  center: [number, number];
  rect: Rect;
}

function formatCenterKey(center: [number, number]) {
  return `${center[0]}:${center[1]}`;
}

function formatRectKey(rect: Rect) {
  return `${rect.left}:${rect.top}:${rect.width}:${rect.height}`;
}

function getElementLabel(element: HighlightLikeElement) {
  if ('content' in element && element.content) {
    return element.content;
  }

  if ('description' in element && element.description) {
    return element.description;
  }

  return undefined;
}

export function normalizeBlackboardHighlights(
  elements: HighlightLikeElement[] | undefined,
): BlackboardHighlightOverlay[] {
  if (!elements?.length) {
    return [];
  }

  const deduped = new Map<string, BlackboardHighlightOverlay>();

  elements.forEach((element, index) => {
    if (!element?.rect || !element?.center) {
      return;
    }

    const label = getElementLabel(element);
    const dedupeKey = [
      'id' in element ? element.id : '',
      label || '',
      formatCenterKey(element.center),
      formatRectKey(element.rect),
    ].join('|');

    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, {
        key:
          ('id' in element && element.id) ||
          `${dedupeKey || 'highlight'}-${index}`,
        label,
        center: element.center,
        rect: element.rect,
      });
    }
  });

  return Array.from(deduped.values());
}

function roundRect(rect: Rect) {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export function formatBlackboardHighlightSummary(
  highlight: BlackboardHighlightOverlay,
) {
  const center = `[${Math.round(highlight.center[0])}, ${Math.round(highlight.center[1])}]`;
  const rect = roundRect(highlight.rect);
  const rectText = `rect=${JSON.stringify(rect)}`;

  if (highlight.label) {
    return `${highlight.label} center=${center}, ${rectText}`;
  }

  return `center=${center}, ${rectText}`;
}
