import {
  type GuiPlusToolCall,
  transformGuiPlusComputerUseAction,
} from '@/ai-model/models/gui-plus/actions';
import { describe, expect, it } from 'vitest';

function transform(arguments_: GuiPlusToolCall['arguments']) {
  return transformGuiPlusComputerUseAction({
    name: 'computer_use',
    arguments: arguments_,
    actionText: 'Do it',
  });
}

describe('transformGuiPlusComputerUseAction', () => {
  it('maps left_click to Tap', () => {
    const actions = transform({
      action: 'left_click',
      coordinate: [123, 456],
    });

    expect(actions).toEqual([
      {
        type: 'Tap',
        param: {
          locate: {
            point: [123, 456],
            prompt: '',
          },
        },
        thought: 'Do it',
      },
    ]);
  });

  it('maps double_click to DoubleClick', () => {
    const actions = transform({
      action: 'double_click',
      coordinate: [123, 456],
    });

    expect(actions[0].type).toBe('DoubleClick');
  });

  it('maps right_click to RightClick', () => {
    const actions = transform({
      action: 'right_click',
      coordinate: [123, 456],
    });

    expect(actions[0].type).toBe('RightClick');
  });

  it('maps type to Input', () => {
    const actions = transform({
      action: 'type',
      text: 'hello',
    });

    expect(actions).toEqual([
      {
        type: 'Input',
        param: { value: 'hello' },
        thought: 'Do it',
      },
    ]);
  });

  it('maps key to KeyboardPress', () => {
    const actions = transform({
      action: 'key',
      keys: ['Control', 'A'],
    });

    expect(actions).toEqual([
      {
        type: 'KeyboardPress',
        param: { keyName: 'Control+A' },
        thought: 'Do it',
      },
    ]);
  });

  it('maps scroll pixels to Scroll', () => {
    const actions = transform({
      action: 'scroll',
      pixels: -3,
      coordinate: [500, 500],
    });

    expect(actions).toEqual([
      {
        type: 'Scroll',
        param: {
          locate: {
            point: [500, 500],
            prompt: '',
          },
          direction: 'down',
          distance: 300,
        },
        thought: 'Do it',
      },
    ]);
  });

  it('maps drag to DragAndDrop', () => {
    const actions = transform({
      action: 'drag',
      coordinate: [100, 200],
      coordinate2: [300, 400],
    });

    expect(actions).toEqual([
      {
        type: 'DragAndDrop',
        param: {
          from: {
            point: [100, 200],
            prompt: '',
          },
          to: {
            point: [300, 400],
            prompt: '',
          },
        },
        thought: 'Do it',
      },
    ]);
  });

  it('maps terminate to Finished', () => {
    const actions = transform({
      action: 'terminate',
      status: 'success',
    });

    expect(actions).toEqual([
      {
        type: 'Finished',
        param: {},
        thought: 'success',
      },
    ]);
  });

  it('throws for unsupported middle_click', () => {
    expect(() =>
      transform({
        action: 'middle_click',
        coordinate: [100, 200],
      }),
    ).toThrow(/not supported/);
  });
});
