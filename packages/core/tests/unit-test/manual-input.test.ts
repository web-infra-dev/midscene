import {
  defineActionDoubleClick,
  defineActionDragAndDrop,
  defineActionHover,
  defineActionInput,
  defineActionKeyboardPress,
  defineActionLongPress,
  defineActionRightClick,
  defineActionSwipe,
  defineActionTap,
} from '@/device';
import { describe, expect, it } from 'vitest';

const noop = async () => {};

function manualToParam(action: {
  manualInput?: { schema: any; toParam: any };
}) {
  if (!action.manualInput) {
    throw new Error('action does not declare manualInput');
  }
  return (raw: unknown) => {
    const parsed = action.manualInput!.schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `schema rejected: ${parsed.error.issues[0].path.join('.')}`,
      );
    }
    return action.manualInput!.toParam(parsed.data);
  };
}

describe('manual input descriptors on action factories', () => {
  it('Tap rounds raw point into a 1×1 locate element', () => {
    const tap = defineActionTap(noop);
    const toParam = manualToParam(tap);
    const param = toParam({ x: 123.4, y: 456.6 });
    expect(param.locate).toMatchObject({
      center: [123, 457],
      description: 'manual Tap',
    });
    expect(param.locate.rect.width).toBeGreaterThan(0);
    expect(param.locate.rect.left).toBeGreaterThanOrEqual(0);
    expect(param.locate.rect.top).toBeGreaterThanOrEqual(0);
  });

  it('Tap rejects non-number coords', () => {
    const tap = defineActionTap(noop);
    const toParam = manualToParam(tap);
    expect(() => toParam({ x: 1 })).toThrow();
    expect(() => toParam({ x: '1', y: 2 })).toThrow();
  });

  it.each([
    ['DoubleClick', () => defineActionDoubleClick(noop)],
    ['RightClick', () => defineActionRightClick(noop)],
    ['Hover', () => defineActionHover(noop)],
  ] as const)(
    '%s wraps {x,y} into a locate element without forwarding duration',
    (name, factory) => {
      const action = factory();
      const toParam = manualToParam(action);
      // Duration on the wire is silently dropped — these actions' typed param
      // has no duration field, so we don't pretend to support it.
      const param = toParam({ x: 10, y: 20, duration: 250 });
      expect(param.locate).toMatchObject({ center: [10, 20] });
      expect(param.locate.description).toBe(`manual ${name}`);
      expect((param as any).duration).toBeUndefined();
    },
  );

  it('LongPress is the only point-style action that forwards duration', () => {
    const longPress = defineActionLongPress(noop);
    const toParam = manualToParam(longPress);
    const withDuration = toParam({ x: 10, y: 20, duration: 250 });
    expect(withDuration).toMatchObject({
      locate: { center: [10, 20], description: 'manual LongPress' },
      duration: 250,
    });
    const withoutDuration = toParam({ x: 10, y: 20 });
    expect(withoutDuration).toEqual({
      locate: expect.objectContaining({ center: [10, 20] }),
    });
  });

  it('Swipe builds start/end locates and forwards optional duration & repeat', () => {
    const swipe = defineActionSwipe(noop);
    const toParam = manualToParam(swipe);
    const param = toParam({
      x: 10,
      y: 20,
      endX: 110,
      endY: 220,
      duration: 500,
      repeat: 2,
    });
    expect(param).toMatchObject({
      start: { center: [10, 20] },
      end: { center: [110, 220] },
      duration: 500,
      repeat: 2,
    });
  });

  it('DragAndDrop maps {x,y,endX,endY} into {from,to}', () => {
    const drag = defineActionDragAndDrop(noop);
    const toParam = manualToParam(drag);
    const param = toParam({ x: 1, y: 2, endX: 3, endY: 4 });
    expect(param).toMatchObject({
      from: { center: [1, 2] },
      to: { center: [3, 4] },
    });
  });

  it('KeyboardPress requires keyName', () => {
    const kbd = defineActionKeyboardPress(noop);
    const toParam = manualToParam(kbd);
    expect(toParam({ keyName: 'Enter' })).toEqual({ keyName: 'Enter' });
    expect(() => toParam({})).toThrow();
  });

  it('Input requires value and accepts optional locate / mode flags', () => {
    const input = defineActionInput(noop);
    const toParam = manualToParam(input);
    const param = toParam({
      value: 'hello',
      x: 50,
      y: 60,
      mode: 'replace',
      autoDismissKeyboard: true,
    });
    expect(param).toMatchObject({
      value: 'hello',
      locate: { center: [50, 60] },
      mode: 'replace',
      autoDismissKeyboard: true,
    });
    expect(() => toParam({})).toThrow();
  });

  it('Input omits locate when only value is provided', () => {
    const input = defineActionInput(noop);
    const toParam = manualToParam(input);
    const param = toParam({ value: 'just text' });
    expect(param).toEqual({ value: 'just text' });
  });
});
