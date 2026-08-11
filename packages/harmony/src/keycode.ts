import type { KeyInput } from '@midscene/shared/us-keyboard-layout';

// Numeric values follow the public OpenHarmony Input Kit KeyCode enum:
// https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-input-kit/js-apis-keycode.md
const namedHarmonyKeyCodeMap = {
  Enter: '2054',
  Backspace: '2055',
  Tab: '2049',
  Escape: '2070',
  Home: '2081',
  End: '2082',
  PageUp: '2068',
  PageDown: '2069',
  Insert: '2083',
  ArrowUp: '2012',
  ArrowDown: '2013',
  ArrowLeft: '2014',
  ArrowRight: '2015',
  Space: '2050',
  Delete: '2071',
  Alt: '2045',
  AltLeft: '2045',
  AltRight: '2046',
  Shift: '2047',
  ShiftLeft: '2047',
  ShiftRight: '2048',
  Control: '2072',
  ControlLeft: '2072',
  ControlRight: '2073',
  Meta: '2076',
  MetaLeft: '2076',
  MetaRight: '2077',
  CapsLock: '2074',
  ScrollLock: '2075',
  Function: '2078',
  Fn: '0',
  Pause: '2080',
  PrintScreen: '2079',
  ContextMenu: '2067',
  Back: 'Back',
  Power: 'Power',
  Eject: '2088',
  Camera: '19',
  AudioVolumeMute: '22',
  AudioVolumeDown: '17',
  AudioVolumeUp: '16',
  VolumeDown: '17',
  VolumeUp: '16',
  MediaPlayPause: '10',
  MediaStop: '11',
  MediaTrackNext: '12',
  MediaTrackPrevious: '13',
  MediaPlay: '2085',
  MediaPause: '2086',
  NumLock: '2102',
  NumpadDivide: '2113',
  NumpadMultiply: '2114',
  NumpadSubtract: '2115',
  NumpadAdd: '2116',
  NumpadDecimal: '2117',
  NumpadEnter: '2119',
  NumpadEqual: '2120',
  Backquote: '2056',
  Minus: '2057',
  Equal: '2058',
  BracketLeft: '2059',
  BracketRight: '2060',
  Backslash: '2061',
  Semicolon: '2062',
  Quote: '2063',
  Slash: '2064',
  Comma: '2043',
  Period: '2044',
  Abort: '2648',
  Help: '2625',
  Convert: '2606',
  NonConvert: '2608',
  Open: '2621',
  AltGraph: '2046',
  Props: '2618',
  Cancel: '2648',
  Clear: '2108',
  Print: '2645',
  Execute: '2621',
  Play: '2643',
  ZoomOut: '2699',
  Accept: '2730',
  CrSel: '2618',
} as const satisfies Record<string, string>;

export const explicitlyUnsupportedHarmonyKeyNames = [
  'ModeChange',
  'Attn',
  'ExSel',
  'EraseEof',
  'SoftLeft',
  'SoftRight',
  'Call',
  'EndCall',
  // OpenHarmony only exposes D-pad and game-controller Select events. Neither
  // has the keyboard Select semantics represented by this Midscene key name.
  'Select',
] as const satisfies readonly KeyInput[];

const explicitlyUnsupportedHarmonyKeySet = new Set<string>(
  explicitlyUnsupportedHarmonyKeyNames.map((key) => key.toLowerCase()),
);
const harmonySystemKeyEvents = new Set(['Back', 'Power']);
const maxHarmonyKeyCodesPerEvent = 3;

const keyNameAliasMap = new Map<string, string>([
  ['return', 'Enter'],
  ['esc', 'Escape'],
  ['up', 'ArrowUp'],
  ['down', 'ArrowDown'],
  ['left', 'ArrowLeft'],
  ['right', 'ArrowRight'],
  ['ctrl', 'Control'],
  ['command', 'Meta'],
  ['cmd', 'Meta'],
  ['option', 'Alt'],
  ['win', 'Meta'],
  ['windows', 'Meta'],
  ['del', 'Delete'],
  ['page up', 'PageUp'],
  ['page down', 'PageDown'],
]);

const caseInsensitiveNamedKeyCodeMap = new Map(
  Object.entries(namedHarmonyKeyCodeMap).map(([key, code]) => [
    key.toLowerCase(),
    code,
  ]),
);

function numericKeyCode(value: number): string {
  return String(value);
}

function splitHarmonyKeyCombination(keyName: string): string[] | undefined {
  if (!keyName.includes('+')) return undefined;

  const parts = keyName.split('+');
  const keys = parts.map((key) => key.trim());
  if (keys.some((key) => key.length === 0)) {
    throw new Error(`Invalid HarmonyOS key combination: ${keyName}`);
  }
  return keys;
}

function resolveSingleHarmonyKeyCodes(keyName: string): string[] {
  const trimmedKeyName = keyName.trim();
  if (!trimmedKeyName) {
    if (keyName.length === 0) {
      throw new Error('Unsupported HarmonyOS key: empty key name');
    }
    throw unsupportedKeyboardPressKey(keyName);
  }

  const alias = keyNameAliasMap.get(trimmedKeyName.toLowerCase());
  const normalizedKeyName = alias ?? trimmedKeyName;

  const digitCodeMatch = normalizedKeyName.match(/^Digit([0-9])$/i);
  if (digitCodeMatch) {
    return [numericKeyCode(2000 + Number(digitCodeMatch[1]))];
  }

  const physicalLetterMatch = normalizedKeyName.match(/^Key([a-z])$/i);
  if (physicalLetterMatch) {
    const alphabetIndex =
      physicalLetterMatch[1].toUpperCase().charCodeAt(0) - 65;
    return [numericKeyCode(2017 + alphabetIndex)];
  }

  const functionKeyMatch = normalizedKeyName.match(/^F([1-9]|1[0-9]|2[0-4])$/i);
  if (functionKeyMatch) {
    const functionKeyNumber = Number(functionKeyMatch[1]);
    const firstExtendedFunctionKeyCode = 2816;
    const functionKeyCode =
      functionKeyNumber <= 12
        ? 2089 + functionKeyNumber
        : firstExtendedFunctionKeyCode + functionKeyNumber - 13;
    return [numericKeyCode(functionKeyCode)];
  }

  const numpadDigitMatch = normalizedKeyName.match(/^Numpad([0-9])$/i);
  if (numpadDigitMatch) {
    return [numericKeyCode(2103 + Number(numpadDigitMatch[1]))];
  }

  const namedCode = caseInsensitiveNamedKeyCodeMap.get(
    normalizedKeyName.toLowerCase(),
  );
  if (namedCode) {
    return [namedCode];
  }

  if (explicitlyUnsupportedHarmonyKeySet.has(normalizedKeyName.toLowerCase())) {
    throw new Error(
      `Unsupported HarmonyOS key: ${keyName} (not available on HarmonyOS)`,
    );
  }

  // Preserve the low-level escape hatch for callers that already have an
  // explicit HarmonyOS keycode. Requiring at least two digits keeps character
  // values such as "1" separate from native keycode input.
  if (/^\d{2,}$/.test(normalizedKeyName)) {
    const explicitKeyCode = Number(normalizedKeyName);
    if (Number.isSafeInteger(explicitKeyCode)) {
      return [numericKeyCode(explicitKeyCode)];
    }
  }

  throw unsupportedKeyboardPressKey(keyName);
}

function unsupportedKeyboardPressKey(keyName: string): Error {
  return new Error(
    `Unsupported HarmonyOS keyboardPress key: ${JSON.stringify(keyName)}. Use typeText() for text input, or pass a named/physical key such as "Enter", "KeyA", or "Slash".`,
  );
}

/**
 * Resolve a named or physical keyboard key to the codes accepted by HarmonyOS
 * `uitest uiInput keyEvent`. Printable characters are intentionally rejected:
 * their physical key combinations depend on the active keyboard layout and
 * should be entered with typeText() instead. Back/Home/Power are the only
 * supported string values at the HDC boundary; keyboard Home intentionally
 * resolves to KEYCODE_MOVE_HOME instead of the system Home action.
 */
export function resolveHarmonyKeyCodes(keyName: string): string[] {
  const trimmedKeyName = keyName.trim();
  if (!trimmedKeyName && keyName !== ' ') {
    return resolveSingleHarmonyKeyCodes(keyName);
  }
  if (trimmedKeyName === '+') {
    return resolveSingleHarmonyKeyCodes(keyName);
  }

  const combination = splitHarmonyKeyCombination(trimmedKeyName);
  if (!combination) return resolveSingleHarmonyKeyCodes(keyName);

  const resolvedCodes = combination.flatMap(resolveSingleHarmonyKeyCodes);
  const uniqueCodes = [...new Set(resolvedCodes)];

  if (uniqueCodes.some((code) => harmonySystemKeyEvents.has(code))) {
    throw new Error(
      `HarmonyOS system key events cannot be combined: ${keyName}`,
    );
  }
  if (uniqueCodes.length > maxHarmonyKeyCodesPerEvent) {
    throw new Error(
      `HarmonyOS key combinations support at most ${maxHarmonyKeyCodesPerEvent} key codes: ${keyName}`,
    );
  }

  return uniqueCodes;
}
