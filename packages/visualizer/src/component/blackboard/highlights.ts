import type { BaseElement, LocateResultElement } from '@midscene/core';

type HighlightLikeElement =
  | (Pick<BaseElement, 'center'> & Partial<Pick<BaseElement, 'content' | 'id'>>)
  | LocateResultElement;

export interface BlackboardHighlightOverlay {
  key: string;
  label?: string;
  center: [number, number];
}

function formatCenterKey(center: [number, number]) {
  return `${center[0]}:${center[1]}`;
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
    if (!element?.center) {
      return;
    }

    const label = getElementLabel(element);
    const dedupeKey = [
      'id' in element ? element.id : '',
      label || '',
      formatCenterKey(element.center),
    ].join('|');

    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, {
        key:
          ('id' in element && element.id) ||
          `${dedupeKey || 'highlight'}-${index}`,
        label,
        center: element.center,
      });
    }
  });

  return Array.from(deduped.values());
}

export function formatBlackboardHighlightSummary(
  highlight: BlackboardHighlightOverlay,
) {
  const center = `[${Math.round(highlight.center[0])}, ${Math.round(highlight.center[1])}]`;

  if (highlight.label) {
    return `${highlight.label} center=${center}`;
  }

  return `center=${center}`;
}
