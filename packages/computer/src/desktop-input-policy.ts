/**
 * Behavioral contract shared by native and RDP desktops.
 * Target clicks wait for hover-driven UI updates after the final move.
 * Hover and untargeted Scroll use the same settling period.
 */
export const desktopPointerPolicy = {
  uiSettleMs: 100,
  moveSettleMs: 50,
  defaultTapHoldMs: 100,
  tapMoveSteps: 8,
  tapMoveStepDelayMs: 8,
  hoverMoveSteps: 10,
  hoverMoveStepDelayMs: 10,
} as const;

export const desktopKeyboardPolicy = {
  focusBeforeTypeMs: 300,
  focusBeforeClearMs: 300,
  focusBeforeShortcutMs: 50,
  afterClearMs: 150,
} as const;

export function resolveTapHoldDuration(duration?: number): number {
  return Math.max(
    0,
    Math.round(duration ?? desktopPointerPolicy.defaultTapHoldMs),
  );
}
