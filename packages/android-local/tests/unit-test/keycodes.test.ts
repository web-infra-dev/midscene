import { describe, expect, test } from '@rstest/core';

import {
  ANDROID_SYSTEM_KEY_CODES,
  buildClearInputKeyCodes,
} from '../../src/index';
import {
  ANDROID_KEY_CODES,
  isKeyCombination,
  normalizeKeyName,
  resolveKeyCode,
} from '../../src/keycodes';

describe('key name resolution', () => {
  test('maps the keys the model is allowed to press', () => {
    expect(resolveKeyCode('Enter')).toBe(66);
    expect(resolveKeyCode('Backspace')).toBe(67);
    expect(resolveKeyCode('Tab')).toBe(61);
    expect(resolveKeyCode('ArrowUp')).toBe(19);
    expect(resolveKeyCode('ArrowDown')).toBe(20);
    expect(resolveKeyCode('ArrowLeft')).toBe(21);
    expect(resolveKeyCode('ArrowRight')).toBe(22);
    expect(resolveKeyCode('Escape')).toBe(111);
    expect(resolveKeyCode('Home')).toBe(3);
    expect(resolveKeyCode('End')).toBe(123);
  });

  test('is case-insensitive and accepts aliases', () => {
    expect(normalizeKeyName('ENTER')).toBe('Enter');
    expect(normalizeKeyName('esc')).toBe('Escape');
    expect(normalizeKeyName('up')).toBe('ArrowUp');
    expect(resolveKeyCode('enter')).toBe(ANDROID_KEY_CODES.Enter);
    expect(resolveKeyCode('DOWN')).toBe(ANDROID_KEY_CODES.ArrowDown);
  });

  test('maps single letters onto the A-Z keycode range', () => {
    expect(resolveKeyCode('a')).toBe(29);
    expect(resolveKeyCode('Z')).toBe(54);
  });

  test('returns undefined for unsupported keys instead of guessing', () => {
    expect(resolveKeyCode('F13')).toBeUndefined();
    expect(resolveKeyCode('Meta')).toBeUndefined();
  });

  test('detects key combinations that a single keyevent cannot express', () => {
    expect(isKeyCombination('Ctrl+A')).toBe(true);
    expect(isKeyCombination('+')).toBe(false);
    expect(isKeyCombination('Enter')).toBe(false);
  });

  test('exposes the system keys used by the input primitives', () => {
    expect(ANDROID_SYSTEM_KEY_CODES).toEqual({
      back: 4,
      home: 3,
      recentApps: 187,
    });
  });
});

describe('buildClearInputKeyCodes', () => {
  test('moves to the end and deletes both directions', () => {
    const keyCodes = buildClearInputKeyCodes(2);

    expect(keyCodes).toEqual([123, 67, 112, 67, 112]);
  });

  test('defaults to the same bound the ADB path uses', () => {
    expect(buildClearInputKeyCodes()).toHaveLength(1 + 100 * 2);
  });
});
