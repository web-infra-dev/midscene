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
  Mute: '22',
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
  '*': '2010',
  '#': '2011',
  '@': '2065',
  '+': '2066',
  '`': '2056',
  '-': '2057',
  '=': '2058',
  '[': '2059',
  ']': '2060',
  '\\': '2061',
  ';': '2062',
  "'": '2063',
  '/': '2064',
  ',': '2043',
  '.': '2044',
  Abort: '2648',
  Help: '2625',
  Convert: '2606',
  NonConvert: '2608',
  Select: '2016',
  Open: '2621',
  AltGraph: '2046',
  Props: '2618',
  Cancel: '2648',
  Clear: '2108',
  Print: '2645',
  Execute: '2621',
  Play: '2643',
  ZoomOut: '2699',
} as const satisfies Record<string, string>;

const shiftedSymbolKeyCodeMap = {
  ')': '2000',
  '!': '2001',
  $: '2004',
  '%': '2005',
  '^': '2006',
  '&': '2007',
  '(': '2009',
  ':': '2062',
  '<': '2043',
  _: '2057',
  '>': '2044',
  '?': '2064',
  '~': '2056',
  '{': '2059',
  '|': '2061',
  '}': '2060',
  '"': '2063',
} as const;

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

/**
 * Resolve a Midscene keyboard key name to the numeric key codes accepted by
 * HarmonyOS `uitest uiInput keyEvent`. Back/Home/Power are the only supported
 * string values at the HDC boundary; keyboard Home intentionally resolves to
 * KEYCODE_MOVE_HOME instead of the system Home action.
 */
export function resolveHarmonyKeyCodes(keyName: string): string[] {
  if (keyName === ' ') return ['2050'];
  if (keyName === '\r' || keyName === '\n') return ['2054'];
  if (keyName === '\u0000') return ['2117'];

  const trimmedKeyName = keyName.trim();
  if (!trimmedKeyName) {
    throw new Error('Unsupported HarmonyOS key: empty key name');
  }

  const alias = keyNameAliasMap.get(trimmedKeyName.toLowerCase());
  const normalizedKeyName = alias ?? trimmedKeyName;

  const shiftedSymbolCode =
    shiftedSymbolKeyCodeMap[
      normalizedKeyName as keyof typeof shiftedSymbolKeyCodeMap
    ];
  if (shiftedSymbolCode) {
    return ['2047', shiftedSymbolCode];
  }

  if (/^\d$/.test(normalizedKeyName)) {
    return [numericKeyCode(2000 + Number(normalizedKeyName))];
  }

  const digitCodeMatch = normalizedKeyName.match(/^Digit([0-9])$/i);
  if (digitCodeMatch) {
    return [numericKeyCode(2000 + Number(digitCodeMatch[1]))];
  }

  const letterMatch = normalizedKeyName.match(/^(?:Key)?([a-z])$/i);
  if (letterMatch) {
    const alphabetIndex = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
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

  // Preserve the low-level escape hatch for callers that already have an
  // explicit HarmonyOS keycode. A single digit is handled above as a keyboard
  // digit so it cannot accidentally trigger low system keycodes such as Home.
  if (/^\d{2,}$/.test(normalizedKeyName)) {
    const explicitKeyCode = Number(normalizedKeyName);
    if (Number.isSafeInteger(explicitKeyCode)) {
      return [numericKeyCode(explicitKeyCode)];
    }
  }

  throw new Error(`Unsupported HarmonyOS key: ${keyName}`);
}
