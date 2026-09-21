import { resolveHarmonyKeyCodes } from '@/keycode';
import { describe, expect, it } from '@rstest/core';

describe('resolveHarmonyKeyCodes', () => {
  it.each([
    ['Enter', ['2054']],
    ['Backspace', ['2055']],
    ['Tab', ['2049']],
    ['Escape', ['2070']],
    ['Home', ['Home']],
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
    ['Back', ['Back']],
    ['Power', ['Power']],
  ])('maps %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(
    Array.from({ length: 10 }, (_, digit): [string, string[]] => [
      String(digit),
      [String(2000 + digit)],
    ]),
  )('maps digit key %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(
    Array.from({ length: 26 }, (_, index): [string, string[]] => [
      String.fromCharCode(65 + index),
      [String(2017 + index)],
    ]),
  )('maps letter key %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it('treats letter key names case-insensitively', () => {
    expect(resolveHarmonyKeyCodes('a')).toEqual(['2017']);
  });

  it.each([
    ['enter', ['2054']],
    ['esc', ['2070']],
    ['up', ['2012']],
    ['down', ['2013']],
    ['left', ['2014']],
    ['right', ['2015']],
    ['ctrl', ['2072']],
  ])('normalizes alias %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each([
    '?',
    '+',
    '/',
    'KeyA',
    'Digit1',
    'F5',
    'Numpad1',
    'CapsLock',
    'AudioVolumeMute',
    '2210',
    'Mute',
    'not-a-key',
    '中文',
  ])('rejects unknown key %s', (keyName) => {
    expect(() => resolveHarmonyKeyCodes(keyName)).toThrow(
      `Unsupported HarmonyOS keyboardPress key: ${JSON.stringify(keyName)}`,
    );
  });

  it.each([
    'Control+A',
    'Ctrl+a',
    'Shift+1',
    'Control+Shift+A',
    'Control + Alt + Delete',
    'Control+',
    'Control++',
    'Shift+Slash',
  ])('rejects key combination %s', (keyName) => {
    expect(() => resolveHarmonyKeyCodes(keyName)).toThrow(
      `HarmonyOS keyboardPress does not support key combinations: ${JSON.stringify(keyName)}`,
    );
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
