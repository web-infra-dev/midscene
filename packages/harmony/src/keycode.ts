// Numeric values follow the public OpenHarmony Input Kit KeyCode enum:
// https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-input-kit/js-apis-keycode.md
const namedHarmonyKeyCodeMap = {
  Enter: '2054',
  Backspace: '2055',
  Tab: '2049',
  Escape: '2070',
  Home: 'Home',
  ArrowUp: '2012',
  ArrowDown: '2013',
  ArrowLeft: '2014',
  ArrowRight: '2015',
  Space: '2050',
  Delete: '2071',
  Alt: '2045',
  Shift: '2047',
  Control: '2072',
  Meta: '2076',
  Back: 'Back',
  Power: 'Power',
} as const satisfies Record<string, string>;

const keyNameAliasMap = new Map<string, string>([
  ['return', 'Enter'],
  ['esc', 'Escape'],
  ['up', 'ArrowUp'],
  ['down', 'ArrowDown'],
  ['left', 'ArrowLeft'],
  ['right', 'ArrowRight'],
  ['ctrl', 'Control'],
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

  // Mobile automation injects platform key codes rather than hardware scan
  // codes. Letters and digits therefore name the logical KEY_A / KEY_1 events;
  // their case does not promise a particular text result.
  if (/^[0-9]$/.test(normalizedKeyName)) {
    return [numericKeyCode(2000 + Number(normalizedKeyName))];
  }

  const letterKeyMatch = normalizedKeyName.match(/^[a-z]$/i);
  if (letterKeyMatch) {
    const alphabetIndex = letterKeyMatch[0].toUpperCase().charCodeAt(0) - 65;
    return [numericKeyCode(2017 + alphabetIndex)];
  }

  const namedCode = caseInsensitiveNamedKeyCodeMap.get(
    normalizedKeyName.toLowerCase(),
  );
  if (namedCode) {
    return [namedCode];
  }

  throw unsupportedKeyboardPressKey(keyName);
}

function unsupportedKeyboardPressKey(keyName: string): Error {
  return new Error(
    `Unsupported HarmonyOS keyboardPress key: ${JSON.stringify(keyName)}. Use typeText() for text input, or pass a supported key name such as "Enter", "A", or "1".`,
  );
}

/**
 * Resolve a deliberately small set of logical keyboard key names to the codes
 * accepted by HarmonyOS `uitest uiInput keyEvent`. A-Z and 0-9 identify their
 * standard platform key codes. Text results such as "?" are intentionally not
 * inferred from a keyboard layout and should be entered with typeText().
 * Back/Home/Power are the only supported string values at the HDC boundary.
 */
export function resolveHarmonyKeyCodes(keyName: string): string[] {
  const trimmedKeyName = keyName.trim();
  if (!trimmedKeyName && keyName !== ' ') {
    return resolveSingleHarmonyKeyCodes(keyName);
  }
  if (trimmedKeyName === '+') {
    return resolveSingleHarmonyKeyCodes(keyName);
  }
  if (trimmedKeyName.includes('+')) {
    throw new Error(
      `HarmonyOS keyboardPress does not support key combinations: ${JSON.stringify(keyName)}`,
    );
  }
  return resolveSingleHarmonyKeyCodes(keyName);
}
