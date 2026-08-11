import {
  explicitlyUnsupportedHarmonyKeyNames,
  resolveHarmonyKeyCodes,
} from '@/keycode';
import { _keyDefinitions } from '@midscene/shared/us-keyboard-layout';
import { describe, expect, it } from '@rstest/core';

describe('resolveHarmonyKeyCodes', () => {
  it.each([
    ['Enter', ['2054']],
    ['Backspace', ['2055']],
    ['Tab', ['2049']],
    ['Escape', ['2070']],
    ['Home', ['2081']],
    ['End', ['2082']],
    ['PageUp', ['2068']],
    ['PageDown', ['2069']],
    ['Insert', ['2083']],
    ['ArrowUp', ['2012']],
    ['ArrowDown', ['2013']],
    ['ArrowLeft', ['2014']],
    ['ArrowRight', ['2015']],
    ['Space', ['2050']],
    ['Delete', ['2071']],
    ['Control', ['2072']],
    ['Shift', ['2047']],
    ['Alt', ['2045']],
    ['Meta', ['2076']],
    ['CapsLock', ['2074']],
    ['NumLock', ['2102']],
    ['ScrollLock', ['2075']],
    ['Semicolon', ['2062']],
    ['Equal', ['2058']],
    ['Comma', ['2043']],
    ['Period', ['2044']],
    ['Backquote', ['2056']],
    ['Minus', ['2057']],
    ['BracketLeft', ['2059']],
    ['BracketRight', ['2060']],
    ['Backslash', ['2061']],
    ['Quote', ['2063']],
    ['Slash', ['2064']],
    ['Back', ['Back']],
    ['Power', ['Power']],
    ['Abort', ['2648']],
    ['Help', ['2625']],
    ['Convert', ['2606']],
    ['NonConvert', ['2608']],
    ['Open', ['2621']],
    ['AltGraph', ['2046']],
    ['Props', ['2618']],
    ['Cancel', ['2648']],
    ['Clear', ['2108']],
    ['Print', ['2645']],
    ['Execute', ['2621']],
    ['Play', ['2643']],
    ['ZoomOut', ['2699']],
    ['AudioVolumeMute', ['22']],
    ['Accept', ['2730']],
    ['CrSel', ['2618']],
  ])('maps %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(
    Array.from({ length: 10 }, (_, digit): [string, string[]] => [
      `Digit${digit}`,
      [String(2000 + digit)],
    ]),
  )('maps physical digit key %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(
    Array.from({ length: 26 }, (_, index): [string, string[]] => [
      `Key${String.fromCharCode(65 + index)}`,
      [String(2017 + index)],
    ]),
  )('maps physical letter key %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(
    Array.from({ length: 24 }, (_, index): [string, string[]] => [
      `F${index + 1}`,
      [String(index < 12 ? 2090 + index : 2816 + index - 12)],
    ]),
  )('maps function key %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(
    Array.from({ length: 10 }, (_, digit): [string, string[]] => [
      `Numpad${digit}`,
      [String(2103 + digit)],
    ]),
  )('maps numpad key %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each([
    ['NumpadDivide', ['2113']],
    ['NumpadMultiply', ['2114']],
    ['NumpadSubtract', ['2115']],
    ['NumpadAdd', ['2116']],
    ['NumpadDecimal', ['2117']],
    ['NumpadEnter', ['2119']],
    ['NumpadEqual', ['2120']],
  ])('maps named numpad key %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each([
    ['enter', ['2054']],
    ['esc', ['2070']],
    ['up', ['2012']],
    ['down', ['2013']],
    ['left', ['2014']],
    ['right', ['2015']],
    ['ctrl', ['2072']],
    ['cmd', ['2076']],
    ['option', ['2045']],
    ['win', ['2076']],
    ['page up', ['2068']],
    ['page down', ['2069']],
  ])('normalizes alias %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it('preserves explicit native keycode input', () => {
    expect(resolveHarmonyKeyCodes('2210')).toEqual(['2210']);
  });

  it.each([
    ['Control+KeyA', ['2072', '2017']],
    ['Shift+KeyA', ['2047', '2017']],
    ['Control+Shift+KeyA', ['2072', '2047', '2017']],
    ['Shift+Slash', ['2047', '2064']],
    ['Control+NumpadAdd', ['2072', '2116']],
    ['Control + Alt + Delete', ['2072', '2045', '2071']],
  ])('maps key combination %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(explicitlyUnsupportedHarmonyKeyNames)(
    'explicitly rejects unsupported Midscene key %s',
    (keyName) => {
      expect(() => resolveHarmonyKeyCodes(keyName)).toThrow(
        `Unsupported HarmonyOS key: ${keyName} (not available on HarmonyOS)`,
      );
    },
  );

  it('does not infer physical keys from character values', () => {
    const characterValues = Object.keys(_keyDefinitions).filter(
      (keyName) => Array.from(keyName).length === 1,
    );

    for (const keyName of characterValues) {
      expect(() => resolveHarmonyKeyCodes(keyName)).toThrow(
        `Unsupported HarmonyOS keyboardPress key: ${JSON.stringify(keyName)}`,
      );
    }
  });

  it.each(['Mute', 'not-a-key', '中文'])(
    'rejects unknown key %s',
    (keyName) => {
      expect(() => resolveHarmonyKeyCodes(keyName)).toThrow(
        `Unsupported HarmonyOS keyboardPress key: ${JSON.stringify(keyName)}`,
      );
    },
  );

  it.each([
    [
      'Control+Alt+Shift+KeyA',
      'HarmonyOS key combinations support at most 3 key codes: Control+Alt+Shift+KeyA',
    ],
    [
      'Back+Enter',
      'HarmonyOS system key events cannot be combined: Back+Enter',
    ],
    ['Control+', 'Invalid HarmonyOS key combination: Control+'],
    ['Control++', 'Invalid HarmonyOS key combination: Control++'],
    ['Control+A', 'Unsupported HarmonyOS keyboardPress key: "A"'],
  ])('rejects invalid key combination %s', (keyName, message) => {
    expect(() => resolveHarmonyKeyCodes(keyName)).toThrow(message);
  });

  it('rejects an empty key name', () => {
    const keyName = '';
    expect(() => resolveHarmonyKeyCodes(keyName)).toThrow(
      'Unsupported HarmonyOS key: empty key name',
    );
  });

  it.each([' ', '   ', '\r', '\n', '\u0000'])(
    'directs whitespace and control characters to text input: %j',
    (keyName) => {
      expect(() => resolveHarmonyKeyCodes(keyName)).toThrow(
        `Unsupported HarmonyOS keyboardPress key: ${JSON.stringify(keyName)}`,
      );
    },
  );
});
