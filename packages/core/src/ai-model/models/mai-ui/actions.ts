import type { DeviceAction } from '@/device';
import type { PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { CoordinateDistanceAxis } from '../../shared/model-locate-result';
import type {
  DragAndDropPlanningAction,
  LocatePlanningAction,
  ScrollPlanningAction,
} from '../../shared/planning-action';
import type { MaiUiAction, MaiUiParsedPlanningResponse } from './parser';

const debug = getDebug('mai-ui-actions');

type CoordinateDistanceToPixels = (
  delta: number,
  axis: CoordinateDistanceAxis,
) => number;

const BACK_BUTTON_NAMES = ['AndroidBackButton', 'HarmonyBackButton'];
const HOME_BUTTON_NAMES = ['AndroidHomeButton', 'HarmonyHomeButton'];

function findActionName(
  actionSpace: DeviceAction[] | undefined,
  knownNames: string[],
  defaultName: string,
): string {
  if (!actionSpace) return defaultName;
  return (
    actionSpace.find((action) => knownNames.includes(action.name))?.name ??
    defaultName
  );
}

function getPoint(coordinates: number[] | undefined, fieldName: string) {
  assert(
    Array.isArray(coordinates) &&
      (coordinates.length === 2 || coordinates.length === 4) &&
      coordinates.every(
        (coordinate) =>
          typeof coordinate === 'number' && Number.isFinite(coordinate),
      ),
    `MAI-UI ${fieldName} must be [x,y] or [x1,y1,x2,y2], got ${JSON.stringify(
      coordinates,
    )}`,
  );

  if (coordinates.length === 2) {
    return [coordinates[0], coordinates[1]] as [number, number];
  }

  const [x1, y1, x2, y2] = coordinates;
  return [(x1 + x2) / 2, (y1 + y2) / 2] as [number, number];
}

function scrollDistanceFromDirection(
  direction: string | undefined,
  coordinateDistanceToPixels: CoordinateDistanceToPixels,
): { direction: 'up' | 'down' | 'left' | 'right'; distance: number } {
  const normalizedDirection = direction?.toLowerCase();
  assert(
    normalizedDirection === 'up' ||
      normalizedDirection === 'down' ||
      normalizedDirection === 'left' ||
      normalizedDirection === 'right',
    `MAI-UI swipe.direction must be up, down, left, or right, got ${direction}`,
  );

  const axis: CoordinateDistanceAxis =
    normalizedDirection === 'left' || normalizedDirection === 'right'
      ? 'x'
      : 'y';
  return {
    direction: normalizedDirection,
    distance: Math.abs(coordinateDistanceToPixels(500, axis)),
  };
}

export function transformMaiUiAction(
  action: MaiUiAction,
  {
    actionSpace,
    coordinateDistanceToPixels,
    thought,
  }: {
    actionSpace?: DeviceAction[];
    coordinateDistanceToPixels: CoordinateDistanceToPixels;
    thought?: string;
  },
): PlanningAction[] {
  try {
    switch (action.action) {
      case 'click': {
        const point = getPoint(action.coordinate, 'coordinate');
        return [
          {
            type: 'Tap',
            param: {
              locate: { point, prompt: thought ?? '' },
            },
            thought,
          } satisfies LocatePlanningAction<'Tap'>,
        ];
      }
      case 'double_click': {
        const point = getPoint(action.coordinate, 'coordinate');
        return [
          {
            type: 'DoubleClick',
            param: {
              locate: { point, prompt: thought ?? '' },
            },
            thought,
          } satisfies LocatePlanningAction<'DoubleClick'>,
        ];
      }
      case 'long_press': {
        const point = getPoint(action.coordinate, 'coordinate');
        return [
          {
            type: 'LongPress',
            param: {
              locate: { point, prompt: thought ?? '' },
            },
            thought,
          } satisfies LocatePlanningAction<'LongPress'>,
        ];
      }
      case 'type':
        return [
          {
            type: 'Input',
            param: { value: action.text },
            thought,
          },
        ];
      case 'swipe': {
        const point =
          action.coordinate !== undefined
            ? getPoint(action.coordinate, 'coordinate')
            : ([500, 500] as [number, number]);
        const { direction, distance } = scrollDistanceFromDirection(
          action.direction,
          coordinateDistanceToPixels,
        );
        return [
          {
            type: 'Scroll',
            param: {
              locate: { point, prompt: thought ?? '' },
              direction,
              distance,
            },
            thought,
          } satisfies ScrollPlanningAction,
        ];
      }
      case 'drag': {
        const startPoint = getPoint(
          action.start_coordinate,
          'start_coordinate',
        );
        const endPoint = getPoint(action.end_coordinate, 'end_coordinate');
        return [
          {
            type: 'DragAndDrop',
            param: {
              from: { point: startPoint, prompt: thought ?? '' },
              to: { point: endPoint, prompt: thought ?? '' },
            },
            thought,
          } satisfies DragAndDropPlanningAction,
        ];
      }
      case 'open':
        return [
          {
            type: 'Launch',
            param: { uri: action.text },
            thought,
          },
        ];
      case 'system_button': {
        const button = action.button.toLowerCase();
        if (button === 'back') {
          return [
            {
              type: findActionName(
                actionSpace,
                BACK_BUTTON_NAMES,
                'AndroidBackButton',
              ),
              param: {},
              thought,
            },
          ];
        }
        if (button === 'home') {
          return [
            {
              type: findActionName(
                actionSpace,
                HOME_BUTTON_NAMES,
                'AndroidHomeButton',
              ),
              param: {},
              thought,
            },
          ];
        }
        throw new Error(`Unsupported MAI-UI system_button: ${action.button}`);
      }
      case 'wait':
        return [
          {
            type: 'Sleep',
            param: { timeMs: 1000 },
            thought,
          },
        ];
      case 'terminate':
        return [
          {
            type: 'Finished',
            param: {},
            thought: action.status ?? thought ?? '',
          },
        ];
      case 'answer':
        return [
          {
            type: 'Finished',
            param: {},
            thought: action.text || thought || '',
          },
        ];
      default:
        throw new Error(`Unsupported MAI-UI action: ${action.action}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debug('Transform error:', errorMessage);
    throw new Error(`Failed to transform MAI-UI action: ${errorMessage}`);
  }
}

export function transformMaiUiPlanningResponse(
  parsedResponse: MaiUiParsedPlanningResponse,
  {
    actionSpace,
    coordinateDistanceToPixels,
  }: {
    actionSpace?: DeviceAction[];
    coordinateDistanceToPixels: CoordinateDistanceToPixels;
  },
): PlanningAction[] {
  return transformMaiUiAction(parsedResponse.action, {
    actionSpace,
    coordinateDistanceToPixels,
    thought: parsedResponse.thinking,
  });
}
