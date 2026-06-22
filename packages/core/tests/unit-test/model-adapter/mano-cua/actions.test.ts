import { transformManoCuaAction } from '@/ai-model/models/mano-cua/actions';
import type { ManoCuaParsedAction } from '@/ai-model/models/mano-cua/parser';
import type { DeviceAction } from '@/device';
import { describe, expect, it } from 'vitest';

function action(
  name: string,
  args: Record<string, string> = {},
): ManoCuaParsedAction {
  return {
    name,
    args,
    rawAction: `${name}()`,
  };
}

function transformForTest(
  parsedAction: ManoCuaParsedAction,
  actionSpace?: DeviceAction[],
) {
  return transformManoCuaAction(parsedAction, {
    actionSpace,
    think: 'thought',
    actionDescription: 'description',
  });
}

describe('transformManoCuaAction', () => {
  it('transforms click action to Tap PlanningAction', () => {
    const result = transformForTest(
      action('click', {
        start_box: '<|box_start|>(100,200)<|box_end|>',
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Tap');
    expect(result[0].param.locate).toEqual({
      point: [100, 200],
      prompt: 'description',
    });
  });

  it('accepts plain coordinate boxes returned by Mano-CUA service', () => {
    const result = transformForTest(
      action('click', {
        start_box: '(290,139)',
      }),
    );

    expect(result[0].param.locate).toEqual({
      point: [290, 139],
      prompt: 'description',
    });
  });

  it('uses the center point when Mano-CUA returns a bounding box', () => {
    expect(
      transformForTest(
        action('click', {
          start_box: '(100,200,300,400)',
        }),
      )[0].param.locate.point,
    ).toEqual([200, 300]);
    expect(
      transformForTest(
        action('click', {
          start_box: '<|box_start|>(100,200,300,400)<|box_end|>',
        }),
      )[0].param.locate.point,
    ).toEqual([200, 300]);
  });

  it('transforms pointer actions', () => {
    expect(
      transformForTest(
        action('doubleclick', {
          start_box: '<|box_start|>(100,200)<|box_end|>',
        }),
      )[0].type,
    ).toBe('DoubleClick');
    expect(
      transformForTest(
        action('right_single', {
          start_box: '<|box_start|>(100,200)<|box_end|>',
        }),
      )[0].type,
    ).toBe('RightClick');
    expect(
      transformForTest(
        action('hover', {
          start_box: '<|box_start|>(100,200)<|box_end|>',
        }),
      )[0].type,
    ).toBe('Hover');
  });

  it('transforms type and hotkey actions', () => {
    expect(
      transformForTest(action('type', { content: 'hello' }))[0],
    ).toMatchObject({
      type: 'Input',
      param: {
        value: 'hello',
        mode: 'typeOnly',
      },
    });

    expect(
      transformForTest(action('hotkey', { key: 'cmd+c' }))[0],
    ).toMatchObject({
      type: 'KeyboardPress',
      param: {
        keyName: 'Meta+C',
      },
    });
  });

  it('transforms scroll action', () => {
    const result = transformForTest(
      action('scroll', {
        start_box: '<|box_start|>(200,300)<|box_end|>',
        direction: 'down',
        amount: '3',
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Scroll');
    expect(result[0].param).toEqual({
      locate: {
        point: [200, 300],
        prompt: 'description',
      },
      direction: 'down',
      distance: 300,
    });
  });

  it('transforms drag action to DragAndDrop PlanningAction', () => {
    const result = transformForTest(
      action('drag', {
        start_box: '<|box_start|>(100,200)<|box_end|>',
        end_box: '<|box_start|>(300,400)<|box_end|>',
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('DragAndDrop');
    expect(result[0].param).toEqual({
      from: { point: [100, 200], prompt: 'description' },
      to: { point: [300, 400], prompt: 'description' },
    });
  });

  it('transforms wait, finish, and stop actions', () => {
    expect(
      transformForTest(action('wait', { duration: '2' }))[0],
    ).toMatchObject({
      type: 'Sleep',
      param: { timeMs: 2000 },
    });
    expect(transformForTest(action('finish'))[0]).toMatchObject({
      type: 'Finished',
      thought: 'description',
    });
    expect(
      transformForTest(action('stop', { reason: 'not found' }))[0],
    ).toMatchObject({
      type: 'Finished',
      thought: 'not found',
    });
  });

  it('transforms open_app and open_url only when Launch is available', () => {
    const actionSpace = [
      { name: 'Launch', description: 'Launch', call: async () => {} },
    ] as DeviceAction[];

    expect(
      transformForTest(
        action('open_app', { app_name: 'Safari' }),
        actionSpace,
      )[0],
    ).toMatchObject({
      type: 'Launch',
      param: { uri: 'Safari' },
    });
    expect(
      transformForTest(
        action('open_url', { url: 'https://example.com' }),
        actionSpace,
      )[0],
    ).toMatchObject({
      type: 'Launch',
      param: { uri: 'https://example.com' },
    });
    expect(() =>
      transformForTest(action('open_app', { app_name: 'Safari' })),
    ).toThrow(/requires Launch action/);
  });

  it('throws for unsupported Mano-CUA actions', () => {
    expect(() => transformForTest(action('triple_click'))).toThrow(
      /Unsupported Mano-CUA action/,
    );
    expect(() => transformForTest(action('call_user'))).toThrow(
      /Unsupported Mano-CUA action/,
    );
  });
});
