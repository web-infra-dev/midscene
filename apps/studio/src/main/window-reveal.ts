interface RevealableWindow {
  isDestroyed?: () => boolean;
  onDidFailLoad: (listener: (...args: unknown[]) => void) => void;
  onDidFinishLoad: (listener: (...args: unknown[]) => void) => void;
  onReadyToShow: (listener: () => void) => void;
  show: () => void;
}

/**
 * Some packaged macOS builds never emit `ready-to-show` for the transparent
 * Studio shell, which leaves the app running without a visible window. Reveal
 * the window on the first reliable renderer lifecycle event instead.
 */
export function registerWindowRevealHandlers(window: RevealableWindow): void {
  let revealed = false;

  const reveal = () => {
    if (revealed) {
      return;
    }
    if (window.isDestroyed?.()) {
      return;
    }

    revealed = true;
    window.show();
  };

  window.onReadyToShow(reveal);
  window.onDidFinishLoad(reveal);
  window.onDidFailLoad(reveal);
}
