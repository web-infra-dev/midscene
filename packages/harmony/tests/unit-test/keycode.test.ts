import { resolveHarmonyKeyCodes } from '@/keycode';
import { describe, expect, it } from 'vitest';

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
    ['@', ['2065']],
    ['#', ['2011']],
    ['+', ['2066']],
    ['Back', ['Back']],
    ['Power', ['Power']],
    ['Abort', ['2648']],
    ['Help', ['2625']],
    ['Convert', ['2606']],
    ['NonConvert', ['2608']],
    ['Select', ['2016']],
    ['Open', ['2621']],
    ['AltGraph', ['2046']],
    ['Props', ['2618']],
    ['Cancel', ['2648']],
    ['Clear', ['2108']],
    ['Print', ['2645']],
    ['Execute', ['2621']],
    ['Play', ['2643']],
    ['ZoomOut', ['2699']],
    ['Mute', ['22']],
  ])('maps %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(
    Array.from({ length: 10 }, (_, digit) => [
      String(digit),
      [String(2000 + digit)],
    ]),
  )('maps digit %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each([
    ['a', ['2017']],
    ['A', ['2017']],
    ['KeyA', ['2017']],
    ['z', ['2042']],
    ['Z', ['2042']],
    ['KeyZ', ['2042']],
  ])('maps letter key %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(
    Array.from({ length: 24 }, (_, index) => [
      `F${index + 1}`,
      [String(index < 12 ? 2090 + index : 2816 + index - 12)],
    ]),
  )('maps function key %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(
    Array.from({ length: 10 }, (_, digit) => [
      `Numpad${digit}`,
      [String(2103 + digit)],
    ]),
  )('maps numpad key %s to %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each([
    [':', ['2047', '2062']],
    ['?', ['2047', '2064']],
    ['_', ['2047', '2057']],
    ['!', ['2047', '2001']],
    ['~', ['2047', '2056']],
  ])('maps shifted symbol %s to %j', (keyName, expectedCodes) => {
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

  it.each([
    [' ', ['2050']],
    ['\r', ['2054']],
    ['\n', ['2054']],
    ['\u0000', ['2117']],
    ['2210', ['2210']],
  ])('handles special or explicit input %j', (keyName, expectedCodes) => {
    expect(resolveHarmonyKeyCodes(keyName as string)).toEqual(expectedCodes);
  });

  it.each(['Control+A', 'not-a-key'])(
    'rejects unsupported key %s',
    (keyName) => {
      expect(() => resolveHarmonyKeyCodes(keyName)).toThrow(
        `Unsupported HarmonyOS key: ${keyName}`,
      );
    },
  );

  it.each(['', '   '])('rejects empty key name %j', (keyName) => {
    expect(() => resolveHarmonyKeyCodes(keyName)).toThrow(
      'Unsupported HarmonyOS key: empty key name',
    );
  });
});
