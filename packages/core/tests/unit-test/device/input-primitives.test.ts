import { defineActionsFromInputPrimitives } from '@/device';
import type { ExecutorContext } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';

const mockExecutorContext = { task: {} } as ExecutorContext;

describe('defineActionsFromInputPrimitives', () => {
  it('should expose middle click when the pointer primitive is configured', () => {
    const middleClick = vi.fn();

    const actions = defineActionsFromInputPrimitives({
      pointer: {
        tap: vi.fn(),
        middleClick,
      },
    });

    const middleClickAction = actions.find(
      (action) => action.name === 'MiddleClick',
    );

    expect(middleClickAction).toBeDefined();
    expect(middleClickAction?.interfaceAlias).toBe('aiMiddleClick');
  it('uses desktop guidance for a pointer swipe', async () => {
    const pointerSwipe = rs.fn();
    const actions = defineActionsFromInputPrimitives(
      {
        pointer: {
          tap: rs.fn(),
          swipe: pointerSwipe,
        },
      },
      { size: async () => ({ width: 1920, height: 1080 }) },
    );
    const swipeAction = actions.find((action) => action.name === 'Swipe');

    expect(swipeAction?.description).toContain('primary-mouse-button gesture');
    await swipeAction?.call({ direction: 'right', distance: 100 });
    expect(pointerSwipe).toHaveBeenCalledWith(
      { x: 960, y: 540 },
      { x: 1060, y: 540 },
      { duration: 300 },
    );
  });

  it('keeps touch swipe behavior and guidance when both inputs exist', async () => {
    const pointerSwipe = rs.fn();
    const touchSwipe = rs.fn();
    const actions = defineActionsFromInputPrimitives(
      {
        pointer: {
          tap: rs.fn(),
          swipe: pointerSwipe,
        },
        touch: { swipe: touchSwipe },
      },
      { size: async () => ({ width: 400, height: 800 }) },
    );
    const swipeAction = actions.find((action) => action.name === 'Swipe');

    expect(swipeAction?.description).toContain('Perform a touch gesture');
    await swipeAction?.call({ direction: 'up', distance: 100 });
    expect(touchSwipe).toHaveBeenCalledWith(
      { x: 200, y: 400 },
      { x: 200, y: 300 },
      { duration: 300 },
    );
    expect(pointerSwipe).not.toHaveBeenCalled();
  });

  it('should expose configured system input primitives as actions', async () => {
    const backButton = rs.fn();
    const homeButton = rs.fn();
    const recentAppsButton = rs.fn();

    const actions = defineActionsFromInputPrimitives(
      {
        system: {
          backButton,
          homeButton,
          recentAppsButton,
        },
      },
      {
        systemActions: {
          backButton: {
            name: 'AndroidBackButton',
            description: 'Trigger the system "back" operation',
            delayBeforeRunner: 0,
            delayAfterRunner: 0,
          },
          homeButton: {
            name: 'AndroidHomeButton',
            description: 'Trigger the system "home" operation',
            delayBeforeRunner: 0,
            delayAfterRunner: 0,
          },
          recentAppsButton: {
            name: 'AndroidRecentAppsButton',
            description: 'Trigger the system "recent apps" operation',
          },
        },
      },
    );

    expect(actions.map((action) => action.name)).toEqual([
      'AndroidBackButton',
      'AndroidHomeButton',
      'AndroidRecentAppsButton',
    ]);
    expect(actions[0].paramSchema).toBeUndefined();
    expect(actions[0].delayBeforeRunner).toBe(0);
    expect(actions[0].delayAfterRunner).toBe(0);

    await actions[0].call(undefined, mockExecutorContext);
    await actions[1].call(undefined, mockExecutorContext);
    await actions[2].call(undefined, mockExecutorContext);

    expect(backButton).toHaveBeenCalledTimes(1);
    expect(homeButton).toHaveBeenCalledTimes(1);
    expect(recentAppsButton).toHaveBeenCalledTimes(1);
  });
});
