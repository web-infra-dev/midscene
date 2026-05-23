import {
  commonWebActionsForWebPage,
  createWebInputPrimitives,
} from '@/web-page';
import { defineActionInput } from '@midscene/core/device';
import { describe, expect, test, vi } from 'vitest';

describe('Input action mode and caret behavior', () => {
  const target = { center: [100, 200] };
  const capability = {
    kind: 'native-input',
    supportsClear: true,
    supportsCaret: true,
  };

  const createMockPage = () => ({
    mouse: {
      click: vi.fn(),
      move: vi.fn(),
      wheel: vi.fn(),
      drag: vi.fn(),
    },
    keyboard: {
      type: vi.fn(),
      press: vi.fn(),
    },
    getFocusedInputCapability: vi.fn().mockResolvedValue(capability),
    setFocusedInputCaret: vi.fn(),
    clearInput: vi.fn(),
    flushPendingVisualUpdate: vi.fn(),
  });

  test('typeOnly without caret should focus and type without moving caret', async () => {
    const mockPage = createMockPage();
    const actions = commonWebActionsForWebPage(mockPage as any, false);
    const inputAction = actions.find((a) => a.name === 'Input');

    await inputAction!.call(
      {
        value: 'new text',
        locate: target,
        mode: 'typeOnly',
      },
      {} as any,
    );

    expect(mockPage.mouse.click).toHaveBeenCalledWith(100, 200, {
      button: 'left',
    });
    expect(mockPage.getFocusedInputCapability).not.toHaveBeenCalled();
    expect(mockPage.setFocusedInputCaret).not.toHaveBeenCalled();
    expect(mockPage.clearInput).not.toHaveBeenCalled();
    expect(mockPage.keyboard.press).not.toHaveBeenCalled();
    expect(mockPage.keyboard.type).toHaveBeenCalledWith('new text');
  });

  test('typeOnly with caret should focus, move caret, and type', async () => {
    const mockPage = createMockPage();
    const actions = commonWebActionsForWebPage(mockPage as any, false);
    const inputAction = actions.find((a) => a.name === 'Input');

    await inputAction!.call(
      {
        value: 'new text',
        locate: target,
        mode: 'typeOnly',
        caret: 'end',
      },
      {} as any,
    );

    expect(mockPage.mouse.click).toHaveBeenCalledWith(100, 200, {
      button: 'left',
    });
    expect(mockPage.getFocusedInputCapability).toHaveBeenCalledTimes(1);
    expect(mockPage.setFocusedInputCaret).toHaveBeenCalledWith(
      'end',
      capability,
    );
    expect(mockPage.clearInput).not.toHaveBeenCalled();
    expect(mockPage.keyboard.type).toHaveBeenCalledWith('new text');
  });

  test('replace mode should focus, clear, and type', async () => {
    const mockPage = createMockPage();
    const actions = commonWebActionsForWebPage(mockPage as any, false);
    const inputAction = actions.find((a) => a.name === 'Input');

    await inputAction!.call(
      {
        value: 'replaced text',
        locate: target,
        mode: 'replace',
      },
      {} as any,
    );

    expect(mockPage.mouse.click).toHaveBeenCalledWith(100, 200, {
      button: 'left',
    });
    expect(mockPage.getFocusedInputCapability).toHaveBeenCalledTimes(1);
    expect(mockPage.clearInput).toHaveBeenCalledWith(target, capability);
    expect(mockPage.setFocusedInputCaret).not.toHaveBeenCalled();
    expect(mockPage.keyboard.type).toHaveBeenCalledWith('replaced text');
  });

  test('clear mode should clear without typing', async () => {
    const mockPage = createMockPage();
    const actions = commonWebActionsForWebPage(mockPage as any, false);
    const inputAction = actions.find((a) => a.name === 'Input');

    await inputAction!.call(
      {
        value: 'this should not be typed',
        locate: target,
        mode: 'clear',
      },
      {} as any,
    );

    expect(mockPage.mouse.click).not.toHaveBeenCalled();
    expect(mockPage.getFocusedInputCapability).not.toHaveBeenCalled();
    expect(mockPage.clearInput).toHaveBeenCalledWith(target);
    expect(mockPage.keyboard.type).not.toHaveBeenCalled();
  });

  test('Web Input action schema should expose caret', () => {
    const actions = commonWebActionsForWebPage(createMockPage() as any, false);
    const inputAction = actions.find((a) => a.name === 'Input');
    const schemaShape = (inputAction!.paramSchema as any).shape;

    expect(schemaShape.caret).toBeDefined();
    expect(inputAction!.paramSchema.safeParse({ value: 'text' }).success).toBe(
      true,
    );
    expect(
      inputAction!.paramSchema.safeParse({
        value: 'text',
        mode: 'typeOnly',
        caret: 'end',
      }).success,
    ).toBe(true);
  });

  test('default Input action schema should not expose caret', () => {
    const inputAction = defineActionInput({
      clearInput: async () => {},
      typeText: async () => {},
      keyboardPress: async () => {},
    });
    const schemaShape = (inputAction.paramSchema as any).shape;

    expect(schemaShape.caret).toBeUndefined();
  });
});

describe('Web input primitives', () => {
  test('typeText should pass caret to the focused page capability flow', async () => {
    const capability = {
      kind: 'native-textarea',
      supportsClear: true,
      supportsCaret: true,
    };
    const mockPage = {
      mouse: { click: vi.fn() },
      keyboard: { type: vi.fn(), press: vi.fn() },
      getFocusedInputCapability: vi.fn().mockResolvedValue(capability),
      setFocusedInputCaret: vi.fn(),
      clearInput: vi.fn(),
      flushPendingVisualUpdate: vi.fn(),
    };
    const input = createWebInputPrimitives(mockPage as any);

    await input.keyboard.typeText('abc', {
      target: { center: [10, 20] } as any,
      replace: false,
      caret: 'start',
    });

    expect(mockPage.mouse.click).toHaveBeenCalledWith(10, 20, {
      button: 'left',
    });
    expect(mockPage.getFocusedInputCapability).toHaveBeenCalledTimes(1);
    expect(mockPage.setFocusedInputCaret).toHaveBeenCalledWith(
      'start',
      capability,
    );
    expect(mockPage.clearInput).not.toHaveBeenCalled();
    expect(mockPage.keyboard.type).toHaveBeenCalledWith('abc');
  });
});
