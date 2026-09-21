import { WebDriverRequestError } from '@midscene/webdriver';

type PointerAction =
  | { type: 'pointerMove'; duration: number; x: number; y: number }
  | { type: 'pointerDown' | 'pointerUp'; button: number }
  | { type: 'pause'; duration: number };

type PointerActionSequence = {
  type: 'pointer';
  id: string;
  parameters: { pointerType: 'touch' };
  actions: PointerAction[];
};

type W3CActionsPayload = {
  actions: PointerActionSequence[];
};

function touchSequence(id: string, actions: PointerAction[]) {
  return {
    type: 'pointer',
    id,
    parameters: { pointerType: 'touch' },
    actions,
  } satisfies PointerActionSequence;
}

export function createSwipeActions(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  duration: number,
): W3CActionsPayload {
  return {
    actions: [
      touchSequence('finger1', [
        { type: 'pointerMove', duration: 0, x: fromX, y: fromY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 100 },
        { type: 'pointerMove', duration, x: toX, y: toY },
        { type: 'pointerUp', button: 0 },
      ]),
    ],
  };
}

export function createPinchActions(
  centerX: number,
  centerY: number,
  startDistance: number,
  endDistance: number,
  duration: number,
): W3CActionsPayload {
  const halfStart = startDistance / 2;
  const halfEnd = endDistance / 2;
  const createFingerActions = (direction: -1 | 1): PointerAction[] => [
    {
      type: 'pointerMove',
      duration: 0,
      x: centerX,
      y: Math.round(centerY + direction * halfStart),
    },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: 100 },
    {
      type: 'pointerMove',
      duration,
      x: centerX,
      y: Math.round(centerY + direction * halfEnd),
    },
    { type: 'pointerUp', button: 0 },
  ];

  return {
    actions: [
      touchSequence('finger1', createFingerActions(-1)),
      touchSequence('finger2', createFingerActions(1)),
    ],
  };
}

export function createLongPressActions(
  x: number,
  y: number,
  duration: number,
): W3CActionsPayload {
  return {
    actions: [
      touchSequence('finger1', [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration },
        { type: 'pointerUp', button: 0 },
      ]),
    ],
  };
}

export function isUnsupportedW3CActionsError(error: unknown): boolean {
  if (!(error instanceof WebDriverRequestError)) return false;

  const responseError =
    error.response?.value?.error ?? error.response?.error ?? undefined;
  if (responseError !== undefined) {
    return (
      responseError === 'unknown command' ||
      responseError === 'unsupported operation'
    );
  }

  // Some older WDA versions return a plain 404 response for an unknown route.
  return error.status === 404;
}
