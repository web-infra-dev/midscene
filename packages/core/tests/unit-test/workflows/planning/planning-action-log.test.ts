import { buildPlanningActionLog } from '@/ai-model/workflows/planning/planning-action-log';
import {
  ActionSwipeParamSchema,
  actionDragAndDropParamSchema,
  actionScrollParamSchema,
} from '@/device';
import type { DeviceAction, PlanningAction } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';

const actionDefinition = (
  name: string,
  paramSchema?: DeviceAction['paramSchema'],
): DeviceAction => ({
  name,
  paramSchema,
  call: rs.fn(),
});

describe('buildPlanningActionLog', () => {
  it('keeps non-locator parameters and replaces locator results with prompts', () => {
    const action: PlanningAction = {
      type: 'Scroll',
      param: {
        scrollType: 'singleAction',
        direction: 'down',
        distance: 100,
        locate: {
          prompt: 'Product list',
          bbox: [100, 100, 200, 200],
        },
      },
    };

    expect(
      buildPlanningActionLog(action, [
        actionDefinition('Scroll', actionScrollParamSchema),
      ]),
    ).toBe(
      'Scroll - scrollType: singleAction, direction: down, distance: 100, locate: Product list',
    );
  });

  it('handles multiple locator fields using the action schema', () => {
    const action: PlanningAction = {
      type: 'DragAndDrop',
      param: {
        from: { prompt: 'report.pdf', bbox: [10, 20, 30, 40] },
        to: { prompt: 'Upload folder', bbox: [50, 60, 70, 80] },
      },
    };

    expect(
      buildPlanningActionLog(action, [
        actionDefinition('DragAndDrop', actionDragAndDropParamSchema),
      ]),
    ).toBe('DragAndDrop - from: report.pdf, to: Upload folder');
  });

  it('handles start and end locator fields without losing other parameters', () => {
    const action: PlanningAction = {
      type: 'Swipe',
      param: {
        start: { prompt: 'Notification', bbox: [10, 20, 30, 40] },
        end: { prompt: 'Upper edge', bbox: [50, 60, 70, 80] },
        duration: 300,
      },
    };

    expect(
      buildPlanningActionLog(action, [
        actionDefinition('Swipe', ActionSwipeParamSchema),
      ]),
    ).toBe('Swipe - start: Notification, end: Upper edge, duration: 300');
  });

  it('serializes the complete action when its schema is unavailable', () => {
    const action: PlanningAction = {
      type: 'CustomAction',
      param: {
        target: { prompt: 'Target', bbox: [10, 20, 30, 40] },
        value: 'demo',
      },
    };

    expect(
      buildPlanningActionLog(action, [actionDefinition('CustomAction')]),
    ).toBe(JSON.stringify(action));
  });

  it('serializes the complete action when it is absent from actionSpace', () => {
    const action: PlanningAction = {
      type: 'UnknownAction',
      param: { value: 'demo' },
    };

    expect(buildPlanningActionLog(action, [])).toBe(JSON.stringify(action));
  });
});
