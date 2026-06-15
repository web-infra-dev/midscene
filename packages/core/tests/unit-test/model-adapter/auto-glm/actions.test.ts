import {
  type AutoGLMParsedAction,
  type BackAction,
  type DoubleTapAction,
  type FinishAction,
  type HomeAction,
  type LaunchAction,
  type LongPressAction,
  type SwipeAction,
  type TapAction,
  type TypeAction,
  type WaitAction,
  transformAutoGLMAction,
} from '@/ai-model/models/auto-glm/actions';
import type { DeviceAction } from '@/device';
import { describe, expect, it } from 'vitest';

const defaultSize = { width: 1080, height: 1920 };

function transformAutoGLMActionForTest(
  action: AutoGLMParsedAction,
  actionSpace?: DeviceAction[],
) {
  return transformAutoGLMAction(action, {
    actionSpace,
    shotSize: defaultSize,
  });
}

describe('transformAutoGLMAction', () => {
  it('should transform Tap action to Tap PlanningAction', () => {
    const tapAction: TapAction = {
      _metadata: 'do',
      action: 'Tap',
      element: [100, 200],
      think: 'Click button',
    };

    const result = transformAutoGLMActionForTest(tapAction);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Tap');
    expect(result[0].param.locate.locatedPixelBbox).toHaveLength(4);
    expect(result[0].param.locate.locatedPixelBbox[0]).toBeGreaterThanOrEqual(
      0,
    );
    expect(result[0].param.locate.locatedPixelBbox[2]).toBeLessThanOrEqual(
      defaultSize.width - 1,
    );
  });

  it('should keep Tap locatedPixelBbox inside inclusive image bounds', () => {
    const tapAction: TapAction = {
      _metadata: 'do',
      action: 'Tap',
      element: [1000, 1000],
    };

    const result = transformAutoGLMActionForTest(tapAction);

    expect(result[0].param.locate.locatedPixelBbox).toEqual([
      1068, 1900, 1079, 1919,
    ]);
  });

  it('should transform Double Tap action to DoubleClick PlanningAction', () => {
    const doubleTapAction: DoubleTapAction = {
      _metadata: 'do',
      action: 'Double Tap',
      element: [300, 400],
    };

    const result = transformAutoGLMActionForTest(doubleTapAction);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('DoubleClick');
  });

  it('should transform Type action to Input PlanningAction', () => {
    const tapAction: TapAction = {
      _metadata: 'do',
      action: 'Tap',
      element: [100, 200],
    };
    transformAutoGLMActionForTest(tapAction);

    const typeAction: TypeAction = {
      _metadata: 'do',
      action: 'Type',
      text: 'Hello',
    };

    const result = transformAutoGLMActionForTest(typeAction);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Input');
    expect((result[0].param as any).value).toBe('Hello');
  });

  it('should transform Swipe action to Scroll PlanningAction', () => {
    const swipeAction: SwipeAction = {
      _metadata: 'do',
      action: 'Swipe',
      start: [800, 500],
      end: [200, 500],
      think: 'Swipe left',
    };

    const result = transformAutoGLMActionForTest(swipeAction);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Scroll');
    expect((result[0].param as any).direction).toBe('right');
    expect((result[0].param as any).distance).toBeGreaterThan(600);
  });

  it('should transform Long Press action to LongPress PlanningAction', () => {
    const longPressAction: LongPressAction = {
      _metadata: 'do',
      action: 'Long Press',
      element: [150, 250],
      think: 'Long press icon',
    };

    const result = transformAutoGLMActionForTest(longPressAction);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('LongPress');
  });

  it('should transform Launch action to Launch PlanningAction', () => {
    const launchAction: LaunchAction = {
      _metadata: 'do',
      action: 'Launch',
      app: 'Camera',
    };

    const result = transformAutoGLMActionForTest(launchAction);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Launch');
    expect(result[0].param).toEqual({ uri: 'Camera' });
  });

  it('should transform Wait action to Sleep PlanningAction', () => {
    const waitAction: WaitAction = {
      _metadata: 'do',
      action: 'Wait',
      durationMs: 2000,
      think: 'Wait for page load',
    };

    const result = transformAutoGLMActionForTest(waitAction);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Sleep');
    expect((result[0].param as any).timeMs).toBe(2000);
  });

  it('should transform Back action to AndroidBackButton PlanningAction', () => {
    const backAction: BackAction = {
      _metadata: 'do',
      action: 'Back',
      think: 'Go back',
    };

    const result = transformAutoGLMActionForTest(backAction);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('AndroidBackButton');
  });

  it('should transform Back action to HarmonyBackButton when actionSpace contains it', () => {
    const backAction: BackAction = {
      _metadata: 'do',
      action: 'Back',
      think: 'Go back',
    };

    const harmonyActionSpace = [
      { name: 'HarmonyBackButton', description: 'Back', call: async () => {} },
      { name: 'HarmonyHomeButton', description: 'Home', call: async () => {} },
    ];

    const result = transformAutoGLMActionForTest(
      backAction,
      harmonyActionSpace,
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('HarmonyBackButton');
  });

  it('should fall back to AndroidBackButton when actionSpace is empty', () => {
    const backAction: BackAction = {
      _metadata: 'do',
      action: 'Back',
      think: 'Go back',
    };

    const result = transformAutoGLMActionForTest(backAction, []);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('AndroidBackButton');
  });

  it('should fall back to AndroidBackButton when actionSpace has no matching action', () => {
    const backAction: BackAction = {
      _metadata: 'do',
      action: 'Back',
      think: 'Go back',
    };

    const unrelatedActionSpace = [
      { name: 'Tap', description: 'Tap', call: async () => {} },
    ];

    const result = transformAutoGLMActionForTest(
      backAction,
      unrelatedActionSpace,
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('AndroidBackButton');
  });

  it('should transform Home action to AndroidHomeButton PlanningAction', () => {
    const homeAction: HomeAction = {
      _metadata: 'do',
      action: 'Home',
    };

    const result = transformAutoGLMActionForTest(homeAction);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('AndroidHomeButton');
  });

  it('should transform Home action to HarmonyHomeButton when actionSpace contains it', () => {
    const homeAction: HomeAction = {
      _metadata: 'do',
      action: 'Home',
    };

    const harmonyActionSpace = [
      { name: 'HarmonyBackButton', description: 'Back', call: async () => {} },
      { name: 'HarmonyHomeButton', description: 'Home', call: async () => {} },
    ];

    const result = transformAutoGLMActionForTest(
      homeAction,
      harmonyActionSpace,
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('HarmonyHomeButton');
  });

  it('should transform Finish action to Finished PlanningAction', () => {
    const finishAction: FinishAction = {
      _metadata: 'finish',
      message: 'Task completed successfully',
    };

    const result = transformAutoGLMActionForTest(finishAction);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Finished');
  });

  it('should calculate left direction for swipe', () => {
    const swipeAction: SwipeAction = {
      _metadata: 'do',
      action: 'Swipe',
      start: [200, 500],
      end: [800, 500],
    };

    const result = transformAutoGLMActionForTest(swipeAction);
    expect((result[0].param as any).direction).toBe('left');
  });

  it('should calculate right direction for swipe', () => {
    const swipeAction: SwipeAction = {
      _metadata: 'do',
      action: 'Swipe',
      start: [800, 500],
      end: [200, 500],
    };

    const result = transformAutoGLMActionForTest(swipeAction);
    expect((result[0].param as any).direction).toBe('right');
  });

  it('should calculate down direction for swipe', () => {
    const swipeAction: SwipeAction = {
      _metadata: 'do',
      action: 'Swipe',
      start: [500, 200],
      end: [500, 800],
    };

    const result = transformAutoGLMActionForTest(swipeAction);
    expect((result[0].param as any).direction).toBe('up');
    expect((result[0].param as any).distance).toBeGreaterThan(1100);
  });

  it('should calculate up direction for swipe', () => {
    const swipeAction: SwipeAction = {
      _metadata: 'do',
      action: 'Swipe',
      start: [500, 800],
      end: [500, 200],
    };

    const result = transformAutoGLMActionForTest(swipeAction);
    expect((result[0].param as any).direction).toBe('down');
    expect((result[0].param as any).distance).toBeGreaterThan(1100);
  });

  it('should throw error for unsupported Interact action', () => {
    const interactAction: any = {
      _metadata: 'do',
      action: 'Interact',
    };

    expect(() => transformAutoGLMActionForTest(interactAction)).toThrow(
      'not supported',
    );
  });

  it('should throw error for unsupported Call_API action', () => {
    const callApiAction: any = {
      _metadata: 'do',
      action: 'Call_API',
      instruction: 'call some API',
    };

    expect(() => transformAutoGLMActionForTest(callApiAction)).toThrow(
      'not supported',
    );
  });

  it('should throw error for unsupported Take_over action', () => {
    const takeoverAction: any = {
      _metadata: 'do',
      action: 'Take_over',
      message: 'manual intervention',
    };

    expect(() => transformAutoGLMActionForTest(takeoverAction)).toThrow(
      'not supported',
    );
  });

  it('should throw error for unsupported Note action', () => {
    const noteAction: any = {
      _metadata: 'do',
      action: 'Note',
      message: 'take a note',
    };

    expect(() => transformAutoGLMActionForTest(noteAction)).toThrow(
      'not supported',
    );
  });

  it('should throw error for unknown transformed do action type', () => {
    const unknownAction: any = {
      _metadata: 'do',
      action: 'UnknownAction',
    };

    expect(() => transformAutoGLMActionForTest(unknownAction)).toThrow(
      'Unknown do() action type: UnknownAction',
    );
  });

  it('should throw error for unknown transformed action metadata', () => {
    const unknownMetadataAction: any = {
      _metadata: 'unknown',
    };

    expect(() => transformAutoGLMActionForTest(unknownMetadataAction)).toThrow(
      'Unknown action metadata: unknown',
    );
  });
});
