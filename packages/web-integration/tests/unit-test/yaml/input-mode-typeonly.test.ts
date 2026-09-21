import { commonWebActionsForWebPage } from '@/web-page';
import { describe, expect, rs, test } from '@rstest/core';

describe('Input action typeOnly mode', () => {
  test('typeOnly mode should preserve current focus and not clear input', async () => {
    const clearInputMock = rs.fn();
    const mouseClickMock = rs.fn();
    const keyboardPressMock = rs.fn();
    const keyboardTypeMock = rs.fn();

    // Create a mock page object
    const mockPage = {
      clearInput: clearInputMock,
      mouse: {
        click: mouseClickMock,
        move: rs.fn(),
        wheel: rs.fn(),
        drag: rs.fn(),
      },
      keyboard: {
        type: keyboardTypeMock,
        press: keyboardPressMock,
      },
    } as any;

    // Get actions from commonWebActionsForWebPage
    const actions = commonWebActionsForWebPage(mockPage, false);

    // Find the Input action
    const inputAction = actions.find((a) => a.name === 'Input');
    expect(inputAction).toBeDefined();

    // Test with mode = 'typeOnly'
    await inputAction!.call(
      {
        value: 'new text',
        locate: { center: [100, 200] },
        mode: 'typeOnly',
      },
      {} as any,
    );

    // Verify: clearInput should NOT be called
    expect(clearInputMock).not.toHaveBeenCalled();

    // Verify: typeOnly preserves the existing active element. This is needed
    // for pages that auto-focus the next field after a button click.
    expect(mouseClickMock).not.toHaveBeenCalled();
    expect(keyboardPressMock).not.toHaveBeenCalled();

    // Verify: keyboard.type should be called with the value
    expect(keyboardTypeMock).toHaveBeenCalledWith('new text', undefined);
  });

  test('replace mode should clear input', async () => {
    const clearInputMock = rs.fn();
    const mouseClickMock = rs.fn();
    const keyboardTypeMock = rs.fn();

    const mockPage = {
      clearInput: clearInputMock,
      mouse: {
        click: mouseClickMock,
        move: rs.fn(),
        wheel: rs.fn(),
        drag: rs.fn(),
      },
      keyboard: {
        type: keyboardTypeMock,
        press: rs.fn(),
      },
    } as any;

    const actions = commonWebActionsForWebPage(mockPage, false);
    const inputAction = actions.find((a) => a.name === 'Input');

    // Test with mode = 'replace' (default)
    await inputAction!.call(
      {
        value: 'replaced text',
        locate: { center: [100, 200] },
        mode: 'replace',
      },
      {} as any,
    );

    // Verify: clearInput should be called
    expect(clearInputMock).toHaveBeenCalledTimes(1);

    // Verify: direct mouse.click should NOT be called (clearInput handles focusing)
    expect(mouseClickMock).not.toHaveBeenCalled();

    // Verify: keyboard.type should be called
    expect(keyboardTypeMock).toHaveBeenCalledWith('replaced text', undefined);
  });

  test('clear mode should only clear without typing', async () => {
    const clearInputMock = rs.fn();
    const mouseClickMock = rs.fn();
    const keyboardTypeMock = rs.fn();

    const mockPage = {
      clearInput: clearInputMock,
      mouse: {
        click: mouseClickMock,
        move: rs.fn(),
        wheel: rs.fn(),
        drag: rs.fn(),
      },
      keyboard: {
        type: keyboardTypeMock,
        press: rs.fn(),
      },
    } as any;

    const actions = commonWebActionsForWebPage(mockPage, false);
    const inputAction = actions.find((a) => a.name === 'Input');

    // Test with mode = 'clear'
    await inputAction!.call(
      {
        value: 'this should not be typed',
        locate: { center: [100, 200] },
        mode: 'clear',
      },
      {} as any,
    );

    // Verify: clearInput should be called
    expect(clearInputMock).toHaveBeenCalledTimes(1);

    // Verify: keyboard.type should NOT be called
    expect(keyboardTypeMock).not.toHaveBeenCalled();
  });
});
