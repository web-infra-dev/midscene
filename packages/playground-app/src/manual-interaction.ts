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

export function buildManualScrollInteractPayload(
  point: { x: number; y: number },
  delta: { deltaX: number; deltaY: number },
) {
  const useVertical = Math.abs(delta.deltaY) >= Math.abs(delta.deltaX);
  const rawDistance = useVertical
    ? Math.abs(delta.deltaY)
    : Math.abs(delta.deltaX);
  const direction = useVertical
    ? delta.deltaY >= 0
      ? 'down'
      : 'up'
    : delta.deltaX >= 0
      ? 'right'
      : 'left';

  return {
    actionType: 'Scroll',
    x: point.x,
    y: point.y,
    scrollType: 'singleAction',
    direction,
    distance: Math.max(1, Math.round(rawDistance)),
  };
}
