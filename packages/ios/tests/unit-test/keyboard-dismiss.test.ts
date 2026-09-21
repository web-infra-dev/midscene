import { describe, expect, it } from '@rstest/core';
import {
  type KeyboardAccessoryButton,
  type WebDriverElementRect,
  isKeyboardAccessoryToolbar,
  isNamedDismissButtonNearKeyboard,
  selectKeyboardAccessoryDismissButton,
} from '../../src/keyboard-dismiss';

const keyboardRect: WebDriverElementRect = {
  x: 0,
  y: 583,
  width: 402,
  height: 233,
};
const toolbarRect: WebDriverElementRect = {
  x: 0,
  y: 508,
  width: 402,
  height: 48,
};
const leftButton: KeyboardAccessoryButton = {
  id: 'previous',
  rect: { x: 21, y: 513, width: 41, height: 38 },
};
const rightButton: KeyboardAccessoryButton = {
  id: 'dismiss',
  rect: { x: 341, y: 513, width: 40, height: 38 },
};

describe('keyboard dismissal geometry', () => {
  it('recognizes a toolbar adjacent to the keyboard in portrait and landscape', () => {
    expect(isKeyboardAccessoryToolbar(toolbarRect, keyboardRect)).toBe(true);
    expect(
      isKeyboardAccessoryToolbar(
        { x: 0, y: 254, width: 844, height: 48 },
        { x: 0, y: 302, width: 844, height: 88 },
      ),
    ).toBe(true);
  });

  it.each([
    ['far above the keyboard', { ...toolbarRect, y: 100 }],
    ['too tall', { ...toolbarRect, height: 120 }],
    ['insufficiently overlapping', { ...toolbarRect, x: 250, width: 152 }],
    ['empty', { ...toolbarRect, width: 0 }],
  ])('rejects a toolbar that is %s', (_description, candidate) => {
    expect(isKeyboardAccessoryToolbar(candidate, keyboardRect)).toBe(false);
  });

  it('selects one right-edge control when navigation controls exist on the left', () => {
    expect(
      selectKeyboardAccessoryDismissButton(toolbarRect, [
        leftButton,
        rightButton,
      ]),
    ).toEqual(rightButton);
  });

  it('rejects a custom toolbar with only a right-side business action', () => {
    expect(
      selectKeyboardAccessoryDismissButton(toolbarRect, [rightButton]),
    ).toBeNull();
  });

  it('rejects an ambiguous toolbar with multiple right-side controls', () => {
    expect(
      selectKeyboardAccessoryDismissButton(toolbarRect, [
        leftButton,
        { id: 'save', rect: { x: 275, y: 513, width: 45, height: 38 } },
        rightButton,
      ]),
    ).toBeNull();
  });

  it('rejects a right-side control that is not aligned to the right edge', () => {
    expect(
      selectKeyboardAccessoryDismissButton(toolbarRect, [
        leftButton,
        { id: 'submit', rect: { x: 265, y: 513, width: 40, height: 38 } },
      ]),
    ).toBeNull();
  });

  it('accepts configured controls only inside the keyboard region', () => {
    expect(
      isNamedDismissButtonNearKeyboard(rightButton.rect, keyboardRect),
    ).toBe(true);
    expect(
      isNamedDismissButtonNearKeyboard(
        { x: 320, y: 200, width: 60, height: 40 },
        keyboardRect,
      ),
    ).toBe(false);
  });
});
