export type ManualDragActionType = 'Swipe' | 'DragAndDrop';

export function buildManualDragInteractPayload(
  actionType: ManualDragActionType,
  start: { x: number; y: number },
  end: { x: number; y: number },
  duration: number,
) {
  const basePayload = {
    actionType,
    x: start.x,
    y: start.y,
    endX: end.x,
    endY: end.y,
  };

  if (actionType === 'DragAndDrop') {
    return basePayload;
  }

  return {
    ...basePayload,
    duration,
  };
}
