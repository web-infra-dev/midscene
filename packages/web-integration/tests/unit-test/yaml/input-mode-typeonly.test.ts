import { commonWebActionsForWebPage } from '@/web-page';
import { describe, expect, test, vi } from 'vitest';

describe('Input action typeOnly mode', () => {
  test('typeOnly mode should click to focus but not clear input', async () => {
    const clearInputMock = vi.fn();
    const mouseClickMock = vi.fn();
    const keyboardTypeMock = vi.fn();

    // Create a mock page object
    const mockPage = {
      clearInput: clearInputMock,
      mouse: {
        click: mouseClickMock,
        move: vi.fn(),
        wheel: vi.fn(),
        drag: vi.fn(),
      },
      keyboard: {
        type: keyboardTypeMock,
        press: vi.fn(),
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

    // Verify: mouse.click should be called to focus the element
    expect(mouseClickMock).toHaveBeenCalledTimes(1);
    expect(mouseClickMock).toHaveBeenCalledWith(100, 200, { button: 'left' });

    // Verify: keyboard.type should be called with the value
    expect(keyboardTypeMock).toHaveBeenCalledWith('new text');
  });

  test('replace mode should clear input', async () => {
    const clearInputMock = vi.fn();
    const mouseClickMock = vi.fn();
    const keyboardTypeMock = vi.fn();

    const mockPage = {
      clearInput: clearInputMock,
      mouse: {
        click: mouseClickMock,
        move: vi.fn(),
        wheel: vi.fn(),
        drag: vi.fn(),
      },
      keyboard: {
        type: keyboardTypeMock,
        press: vi.fn(),
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
    expect(keyboardTypeMock).toHaveBeenCalledWith('replaced text');
  });

  test('clear mode should only clear without typing', async () => {
    const clearInputMock = vi.fn();
    const mouseClickMock = vi.fn();
    const keyboardTypeMock = vi.fn();

    const mockPage = {
      clearInput: clearInputMock,
      mouse: {
        click: mouseClickMock,
        move: vi.fn(),
        wheel: vi.fn(),
        drag: vi.fn(),
      },
      keyboard: {
        type: keyboardTypeMock,
        press: vi.fn(),
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
