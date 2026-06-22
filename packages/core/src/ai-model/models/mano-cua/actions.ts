import type { DeviceAction } from '@/device';
import type { PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { transformHotkeyInput } from '@midscene/shared/us-keyboard-layout';
import { assert } from '@midscene/shared/utils';
import type {
  DragAndDropPlanningAction,
  LocatePlanningAction,
} from '../../shared/planning-action';
import type {
  ManoCuaParsedAction,
  ManoCuaParsedPlanningResponse,
} from './parser';

const debug = getDebug('mano-cua-actions');

function getBoxPoint(box: string | undefined, fieldName: string) {
  assert(box, `Mano-CUA ${fieldName} is required`);
  const coordinatePattern = String.raw`\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?))?\s*\)`;
  const normalizedBox = box.trim();
  const markerMatch = normalizedBox.match(
    new RegExp(`^<\\|box_start\\|>${coordinatePattern}<\\|box_end\\|>$`),
  );
  const plainMatch = normalizedBox.match(new RegExp(`^${coordinatePattern}$`));
  const match = markerMatch || plainMatch;
  assert(match, `Invalid Mano-CUA ${fieldName}: ${box}`);

  const x1 = Number(match[1]);
  const y1 = Number(match[2]);
  const x2 = match[3] !== undefined ? Number(match[3]) : undefined;
  const y2 = match[4] !== undefined ? Number(match[4]) : undefined;

  if (x2 !== undefined && y2 !== undefined) {
    return [(x1 + x2) / 2, (y1 + y2) / 2] as [number, number];
  }

  return [x1, y1] as [number, number];
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function actionThought(input: {
  think?: string;
  actionDescription?: string;
}): string {
  return input.actionDescription || input.think || '';
}

function assertLaunchSupported(actionSpace?: DeviceAction[]): void {
  assert(
    actionSpace?.some((action) => action.name === 'Launch'),
    'Mano-CUA open_app/open_url requires Launch action in the current action space',
  );
}

function transformManoCuaHotkey(key: string | undefined): string {
  assert(key, 'Mano-CUA hotkey.key is required');
  const normalizedKey = key
    .replace(/\+/g, ' ')
    .replace(/\b(cmd|command|meta)\b/gi, 'Meta');
  return transformHotkeyInput(normalizedKey).join('+');
}

export function transformManoCuaAction(
  action: ManoCuaParsedAction,
  {
    actionSpace,
    think,
    actionDescription,
  }: {
    actionSpace?: DeviceAction[];
    think?: string;
    actionDescription?: string;
  } = {},
): PlanningAction[] {
  const thought = actionThought({ think, actionDescription });

  try {
    switch (action.name) {
      case 'click': {
        const point = getBoxPoint(action.args.start_box, 'start_box');
        return [
          {
            type: 'Tap',
            param: {
              locate: { point, prompt: thought },
            },
            thought,
          } satisfies LocatePlanningAction<'Tap'>,
        ];
      }
      case 'doubleclick': {
        const point = getBoxPoint(action.args.start_box, 'start_box');
        return [
          {
            type: 'DoubleClick',
            param: {
              locate: { point, prompt: thought },
            },
            thought,
          } satisfies LocatePlanningAction<'DoubleClick'>,
        ];
      }
      case 'right_single': {
        const point = getBoxPoint(action.args.start_box, 'start_box');
        return [
          {
            type: 'RightClick',
            param: {
              locate: { point, prompt: thought },
            },
            thought,
          } satisfies LocatePlanningAction<'RightClick'>,
        ];
      }
      case 'hover': {
        const point = getBoxPoint(action.args.start_box, 'start_box');
        return [
          {
            type: 'Hover',
            param: {
              locate: { point, prompt: thought },
            },
            thought,
          } satisfies LocatePlanningAction<'Hover'>,
        ];
      }
      case 'type':
        return [
          {
            type: 'Input',
            param: {
              value: action.args.content ?? '',
              mode: 'typeOnly',
            },
            thought,
          },
        ];
      case 'hotkey':
        return [
          {
            type: 'KeyboardPress',
            param: {
              keyName: transformManoCuaHotkey(action.args.key),
            },
            thought,
          },
        ];
      case 'scroll': {
        const point = getBoxPoint(action.args.start_box, 'start_box');
        const direction = action.args.direction || 'down';
        assert(
          direction === 'down' ||
            direction === 'up' ||
            direction === 'left' ||
            direction === 'right',
          `Unsupported Mano-CUA scroll direction: ${direction}`,
        );
        const amount = optionalNumber(action.args.amount);
        return [
          {
            type: 'Scroll',
            param: {
              locate: { point, prompt: thought },
              direction,
              ...(amount !== undefined ? { distance: amount * 100 } : {}),
            },
            thought,
          },
        ];
      }
      case 'drag': {
        const startPoint = getBoxPoint(action.args.start_box, 'start_box');
        const endPoint = getBoxPoint(action.args.end_box, 'end_box');
        return [
          {
            type: 'DragAndDrop',
            param: {
              from: { point: startPoint, prompt: thought },
              to: { point: endPoint, prompt: thought },
            },
            thought,
          } satisfies DragAndDropPlanningAction,
        ];
      }
      case 'wait': {
        const durationSeconds = optionalNumber(action.args.duration) ?? 1;
        return [
          {
            type: 'Sleep',
            param: { timeMs: durationSeconds * 1000 },
            thought,
          },
        ];
      }
      case 'finish':
        return [
          {
            type: 'Finished',
            param: {},
            thought,
          },
        ];
      case 'stop':
        return [
          {
            type: 'Finished',
            param: {},
            thought: action.args.reason || thought,
          },
        ];
      case 'open_app':
        assertLaunchSupported(actionSpace);
        return [
          {
            type: 'Launch',
            param: { uri: action.args.app_name },
            thought,
          },
        ];
      case 'open_url':
        assertLaunchSupported(actionSpace);
        return [
          {
            type: 'Launch',
            param: { uri: action.args.url },
            thought,
          },
        ];
      case 'triple_click':
      case 'hotkey_click':
      case 'call_user':
        throw new Error(`Unsupported Mano-CUA action: ${action.name}`);
      default:
        throw new Error(`Unknown Mano-CUA action: ${action.name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debug('Transform error:', errorMessage);
    throw new Error(`Failed to transform Mano-CUA action: ${errorMessage}`);
  }
}

export function transformManoCuaPlanningResponse(
  parsedResponse: ManoCuaParsedPlanningResponse,
  { actionSpace }: { actionSpace?: DeviceAction[] } = {},
): PlanningAction[] {
  return transformManoCuaAction(parsedResponse.action, {
    actionSpace,
    think: parsedResponse.think,
    actionDescription: parsedResponse.actionDescription,
  });
}
