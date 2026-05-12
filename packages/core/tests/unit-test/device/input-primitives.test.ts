import { defineActionsFromInputPrimitives } from '@/device';
import { describe, expect, it, vi } from 'vitest';

describe('defineActionsFromInputPrimitives', () => {
  it('should expose configured system input primitives as actions', async () => {
    const backButton = vi.fn();
    const homeButton = vi.fn();
    const recentAppsButton = vi.fn();

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

    await actions[0].call(undefined);
    await actions[1].call(undefined);
    await actions[2].call(undefined);

    expect(backButton).toHaveBeenCalledTimes(1);
    expect(homeButton).toHaveBeenCalledTimes(1);
    expect(recentAppsButton).toHaveBeenCalledTimes(1);
  });
});
