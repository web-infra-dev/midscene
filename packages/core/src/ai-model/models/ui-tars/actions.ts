import type { PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { transformHotkeyInput } from '@midscene/shared/us-keyboard-layout';
import { assert } from '@midscene/shared/utils';
import type {
  DragAndDropPlanningAction,
  LocatePlanningAction,
} from '../../shared/planning-action';
import type { UiTarsParsedPlanningResponse } from './parser';

const debug = getDebug('ui-tars-planning');
const warnLog = getDebug('ui-tars-planning', { console: true });

export function transformUiTarsActions(
  parsedPlanningResponse: UiTarsParsedPlanningResponse,
): PlanningAction[] {
  const transformActions: PlanningAction[] = [];
  const unhandledActions: Array<{ type: string; thought: string }> = [];

  parsedPlanningResponse.actions.forEach((action) => {
    const actionType = (action.action_type || '').toLowerCase();
    if (actionType === 'click') {
      assert(action.action_inputs.start_box, 'start_box is required');
      const point = getPoint(action.action_inputs.start_box);

      const locate = {
        point,
        prompt: action.thought || '',
      };

      transformActions.push({
        type: 'Tap',
        param: {
          locate,
        },
      } satisfies LocatePlanningAction<'Tap'>);
    } else if (actionType === 'left_double') {
      assert(action.action_inputs.start_box, 'start_box is required');
      const point = getPoint(action.action_inputs.start_box);

      const locate = {
        point,
        prompt: action.thought || '',
      };

      transformActions.push({
        type: 'DoubleClick',
        param: {
          locate,
        },
        thought: action.thought || '',
      } satisfies LocatePlanningAction<'DoubleClick'>);
    } else if (actionType === 'right_single') {
      assert(action.action_inputs.start_box, 'start_box is required');
      const point = getPoint(action.action_inputs.start_box);

      const locate = {
        point,
        prompt: action.thought || '',
      };

      transformActions.push({
        type: 'RightClick',
        param: {
          locate,
        },
        thought: action.thought || '',
      } satisfies LocatePlanningAction<'RightClick'>);
    } else if (actionType === 'drag') {
      assert(action.action_inputs.start_box, 'start_box is required');
      assert(action.action_inputs.end_box, 'end_box is required');
      const startPoint = getPoint(action.action_inputs.start_box);
      const endPoint = getPoint(action.action_inputs.end_box);
      transformActions.push({
        type: 'DragAndDrop',
        param: {
          from: {
            point: startPoint,
            prompt: action.thought || '',
          },
          to: {
            point: endPoint,
            prompt: action.thought || '',
          },
        },
        thought: action.thought || '',
      } satisfies DragAndDropPlanningAction);
    } else if (actionType === 'type') {
      transformActions.push({
        type: 'Input',
        param: {
          value: action.action_inputs.content,
        },
        thought: action.thought || '',
      });
    } else if (actionType === 'scroll') {
      transformActions.push({
        type: 'Scroll',
        param: {
          direction: action.action_inputs.direction,
        },
        thought: action.thought || '',
      });
    } else if (actionType === 'finished') {
      transformActions.push({
        type: 'Finished',
        param: {},
        thought: action.action_inputs.content || action.thought || '',
      });
    } else if (actionType === 'hotkey') {
      if (!action.action_inputs.key) {
        warnLog('No key found in action: hotkey. Will not perform action.');
      } else {
        const keys = transformHotkeyInput(action.action_inputs.key);

        transformActions.push({
          type: 'KeyboardPress',
          param: {
            keyName: keys.join('+'),
          },
          thought: action.thought || '',
        });
      }
    } else if (actionType === 'wait') {
      transformActions.push({
        type: 'Sleep',
        param: {
          timeMs: 1000,
        },
        thought: action.thought || '',
      });
    } else if (actionType) {
      unhandledActions.push({
        type: actionType,
        thought: action.thought || '',
      });
      debug('Unhandled action type:', actionType, 'thought:', action.thought);
    }
  });

  if (transformActions.length === 0) {
    throw new Error(
      buildNoUiTarsActionsError(
        parsedPlanningResponse.rawResponse,
        parsedPlanningResponse.actions,
        unhandledActions,
      ),
    );
  }

  debug('transformActions', JSON.stringify(transformActions, null, 2));
  return transformActions;
}

function getPoint(startBox: string): [number, number] {
  const [x, y] = JSON.parse(startBox);
  assert(
    typeof x === 'number' &&
      Number.isFinite(x) &&
      typeof y === 'number' &&
      Number.isFinite(y),
    `invalid point data for ui-tars planning: ${startBox}`,
  );
  return [x, y];
}

function buildNoUiTarsActionsError(
  rawResponse: string,
  actions: UiTarsParsedPlanningResponse['actions'],
  unhandledActions: Array<{ type: string; thought: string }>,
): string {
  const errorDetails: string[] = [];

  if (actions.length === 0) {
    errorDetails.push('Action parser returned no actions');

    if (rawResponse.includes('Thought:') && !rawResponse.includes('Action:')) {
      errorDetails.push(
        'Response contains "Thought:" but missing "Action:" line',
      );
    } else {
      errorDetails.push('Response may be malformed or empty');
    }
  }

  if (unhandledActions.length > 0) {
    const types = unhandledActions.map((a) => a.type).join(', ');
    errorDetails.push(`Unhandled action types: ${types}`);
  }

  return ['No actions found in UI-TARS response.', ...errorDetails].join('\n');
}
