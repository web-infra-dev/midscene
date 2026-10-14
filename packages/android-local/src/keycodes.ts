/**
 * Key-name → Android keycode mapping.
 *
 * Mirrors `packages/android`'s `pressKey` table so both paths accept the same
 * key names from the model, plus the system keys that Android exposes through
 * dedicated actions.
 */

export const ANDROID_KEY_CODES = {
  Enter: 66,
  Backspace: 67,
  Tab: 61,
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  Escape: 111,
  Home: 3,
  End: 123,
} as const;

/** System keys used by pointer/keyboard primitives. */
export const ANDROID_SYSTEM_KEY_CODES = {
  back: 4,
  home: 3,
  recentApps: 187,
} as const;

export const KEYCODE_ENTER = 66;
export const KEYCODE_BACKSPACE = 67;
export const KEYCODE_FORWARD_DELETE = 112;
export const KEYCODE_MOVE_END = 123;

const KEY_ALIASES: Record<string, string> = {
  enter: 'Enter',
  backspace: 'Backspace',
  tab: 'Tab',
  escape: 'Escape',
  esc: 'Escape',
  home: 'Home',
  end: 'End',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

/** Normalize a model-provided key name (`enter`, `ESC`, `ArrowUp`, …). */
export function normalizeKeyName(key: string): string {
  return KEY_ALIASES[key.toLowerCase()] ?? key;
}

/**
 * Resolve a key name to an Android keycode.
 *
 * Returns `undefined` for unsupported keys — callers must fail loudly
 * (`NotSupported`) rather than silently typing nothing.
 */
export function resolveKeyCode(key: string): number | undefined {
  const normalized = normalizeKeyName(key);
  const mapped =
    ANDROID_KEY_CODES[normalized as keyof typeof ANDROID_KEY_CODES];
  if (mapped !== undefined) {
    return mapped;
  }

  // Single characters map onto the A–Z keycodes (29–54).
  if (key.length === 1) {
    const asciiCode = key.toUpperCase().charCodeAt(0);
    if (asciiCode >= 65 && asciiCode <= 90) {
      return asciiCode - 36;
    }
  }

  return undefined;
}

/** Key combinations are not supported by a single `input keyevent`. */
export function isKeyCombination(key: string): boolean {
  return key.trim() !== '+' && key.includes('+');
}
