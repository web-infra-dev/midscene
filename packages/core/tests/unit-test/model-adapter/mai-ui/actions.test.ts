import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { transformMaiUiAction } from '@/ai-model/models/mai-ui/actions';
import { maiUiAdapters } from '@/ai-model/models/mai-ui/adapter';
import type { MaiUiAction } from '@/ai-model/models/mai-ui/parser';
import { createCoordinateDistanceToPixels } from '@/ai-model/shared/model-locate-result';
import type { DeviceAction } from '@/device';
import { describe, expect, it } from 'vitest';

const defaultSize = { width: 1080, height: 1920 };
const maiUiPlanning = new ResolvedModelAdapter(
  maiUiAdapters['mai-ui'],
  'mai-ui',
).planning;

function transformMaiUiActionForTest(
  action: MaiUiAction,
  actionSpace?: DeviceAction[],
) {
  if (maiUiPlanning.kind !== 'custom') {
    throw new Error('MAI-UI should use custom planning adapter');
  }
  return transformMaiUiAction(action, {
    actionSpace,
    coordinateDistanceToPixels: createCoordinateDistanceToPixels(
      defaultSize,
      maiUiPlanning.coordinateSystem,
    ),
    thought: 'thought',
  });
}

describe('transformMaiUiAction', () => {
  it('transforms click action to Tap PlanningAction', () => {
    const result = transformMaiUiActionForTest({
      action: 'click',
      coordinate: [100, 200],
    });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Tap');
    expect(result[0].param.locate).toEqual({
      point: [100, 200],
      prompt: 'thought',
    });
  });

  it('uses the center point when MAI-UI returns a bbox-like coordinate', () => {
    const result = transformMaiUiActionForTest({
      action: 'click',
      coordinate: [100, 200, 300, 400],
    });

    expect(result[0].param.locate.point).toEqual([200, 300]);
  });

  it('transforms double_click and long_press actions', () => {
    expect(
      transformMaiUiActionForTest({
        action: 'double_click',
        coordinate: [100, 200],
      })[0].type,
    ).toBe('DoubleClick');
    expect(
      transformMaiUiActionForTest({
        action: 'long_press',
        coordinate: [100, 200],
      })[0].type,
    ).toBe('LongPress');
  });

  it('transforms type action to Input PlanningAction', () => {
    const result = transformMaiUiActionForTest({
      action: 'type',
      text: 'hello',
    });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Input');
    expect(result[0].param).toEqual({ value: 'hello' });
  });

  it('transforms swipe action to Scroll PlanningAction', () => {
    const result = transformMaiUiActionForTest({
      action: 'swipe',
      direction: 'up',
      coordinate: [500, 600],
    });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Scroll');
    expect(result[0].param.locate).toEqual({
      point: [500, 600],
      prompt: 'thought',
    });
    expect(result[0].param.direction).toBe('up');
    expect(result[0].param.distance).toBeGreaterThan(0);
  });

  it('transforms drag action to DragAndDrop PlanningAction', () => {
    const result = transformMaiUiActionForTest({
      action: 'drag',
      start_coordinate: [100, 200],
      end_coordinate: [300, 400],
    });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('DragAndDrop');
    expect(result[0].param).toEqual({
      from: { point: [100, 200], prompt: 'thought' },
      to: { point: [300, 400], prompt: 'thought' },
    });
  });

  it('transforms open, wait, terminate, and answer actions', () => {
    expect(
      transformMaiUiActionForTest({ action: 'open', text: 'Settings' })[0],
    ).toMatchObject({ type: 'Launch', param: { uri: 'Settings' } });
    expect(transformMaiUiActionForTest({ action: 'wait' })[0]).toMatchObject({
      type: 'Sleep',
      param: { timeMs: 1000 },
    });
    expect(
      transformMaiUiActionForTest({
        action: 'terminate',
        status: 'success',
      })[0],
    ).toMatchObject({ type: 'Finished', thought: 'success' });
    expect(
      transformMaiUiActionForTest({ action: 'answer', text: 'done' })[0],
    ).toMatchObject({ type: 'Finished', thought: 'done' });
  });

  it('transforms system_button to platform actions', () => {
    const harmonyActionSpace = [
      { name: 'HarmonyBackButton', description: 'Back', call: async () => {} },
      { name: 'HarmonyHomeButton', description: 'Home', call: async () => {} },
    ];

    expect(
      transformMaiUiActionForTest({
        action: 'system_button',
        button: 'back',
      })[0].type,
    ).toBe('AndroidBackButton');
    expect(
      transformMaiUiActionForTest(
        { action: 'system_button', button: 'home' },
        harmonyActionSpace,
      )[0].type,
    ).toBe('HarmonyHomeButton');
  });

  it('throws for unsupported MAI-UI actions', () => {
    expect(() =>
      transformMaiUiActionForTest({
        action: 'ask_user',
        text: 'Need input',
      }),
    ).toThrow(/Unsupported MAI-UI action/);
  });
});
