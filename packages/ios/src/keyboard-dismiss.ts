export type WebDriverElementRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type KeyboardAccessoryButton = {
  id: string;
  rect: WebDriverElementRect;
};

const keyboardAccessoryToolbarGeometry = {
  minHeight: 24,
  maxHeight: 80,
  minHorizontalOverlap: 0.8,
  minRightButtonCenterRatio: 0.65,
  maxGap: 48,
} as const;

const keyboardNamedButtonMaxDistance = 100;

const hasPositiveSize = (rect: WebDriverElementRect): boolean =>
  rect.width > 0 && rect.height > 0;

const centerOf = (rect: WebDriverElementRect) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

export function isNamedDismissButtonNearKeyboard(
  buttonRect: WebDriverElementRect,
  keyboardRect: WebDriverElementRect,
): boolean {
  if (!hasPositiveSize(buttonRect) || !hasPositiveSize(keyboardRect)) {
    return false;
  }

  const buttonCenter = centerOf(buttonRect);
  return (
    buttonCenter.x >= keyboardRect.x &&
    buttonCenter.x <= keyboardRect.x + keyboardRect.width &&
    buttonCenter.y >= keyboardRect.y - keyboardNamedButtonMaxDistance &&
    buttonCenter.y <= keyboardRect.y + keyboardRect.height
  );
}

export function keyboardAccessoryToolbarGap(
  toolbarRect: WebDriverElementRect,
  keyboardRect: WebDriverElementRect,
): number {
  return keyboardRect.y - (toolbarRect.y + toolbarRect.height);
}

export function isKeyboardAccessoryToolbar(
  toolbarRect: WebDriverElementRect,
  keyboardRect: WebDriverElementRect,
): boolean {
  if (!hasPositiveSize(toolbarRect) || !hasPositiveSize(keyboardRect)) {
    return false;
  }

  const overlapWidth = Math.max(
    0,
    Math.min(
      toolbarRect.x + toolbarRect.width,
      keyboardRect.x + keyboardRect.width,
    ) - Math.max(toolbarRect.x, keyboardRect.x),
  );
  const horizontalOverlap = overlapWidth / keyboardRect.width;
  const gap = keyboardAccessoryToolbarGap(toolbarRect, keyboardRect);
  const maxGap = Math.max(
    keyboardAccessoryToolbarGeometry.maxGap,
    toolbarRect.height,
  );

  return (
    toolbarRect.height >= keyboardAccessoryToolbarGeometry.minHeight &&
    toolbarRect.height <= keyboardAccessoryToolbarGeometry.maxHeight &&
    horizontalOverlap >=
      keyboardAccessoryToolbarGeometry.minHorizontalOverlap &&
    toolbarRect.y <= keyboardRect.y &&
    gap >= -toolbarRect.height &&
    gap <= maxGap
  );
}

/**
 * Selects the dismissal control only when a toolbar has the conservative shape
 * used by the standard iOS keyboard accessory: navigation controls on the left
 * and exactly one control aligned to the right edge.
 */
export function selectKeyboardAccessoryDismissButton(
  toolbarRect: WebDriverElementRect,
  buttons: readonly KeyboardAccessoryButton[],
): KeyboardAccessoryButton | null {
  if (!hasPositiveSize(toolbarRect)) {
    return null;
  }

  const rightRegionStart =
    toolbarRect.x +
    toolbarRect.width *
      keyboardAccessoryToolbarGeometry.minRightButtonCenterRatio;
  const buttonsInsideToolbar = buttons.filter(({ rect }) => {
    if (!hasPositiveSize(rect)) {
      return false;
    }
    const center = centerOf(rect);
    return (
      center.x >= toolbarRect.x &&
      center.x <= toolbarRect.x + toolbarRect.width &&
      center.y >= toolbarRect.y &&
      center.y <= toolbarRect.y + toolbarRect.height
    );
  });
  const leftSideButtons = buttonsInsideToolbar.filter(
    ({ rect }) => centerOf(rect).x < rightRegionStart,
  );
  const rightSideButtons = buttonsInsideToolbar.filter(
    ({ rect }) => centerOf(rect).x >= rightRegionStart,
  );

  if (leftSideButtons.length === 0 || rightSideButtons.length !== 1) {
    return null;
  }

  const dismissButton = rightSideButtons[0];
  const rightEdgeGap =
    toolbarRect.x +
    toolbarRect.width -
    (dismissButton.rect.x + dismissButton.rect.width);
  const maxRightEdgeGap = Math.max(
    toolbarRect.height,
    dismissButton.rect.width,
  );
  if (rightEdgeGap < 0 || rightEdgeGap > maxRightEdgeGap) {
    return null;
  }

  return dismissButton;
}
