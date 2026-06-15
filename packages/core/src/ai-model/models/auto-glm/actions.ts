import type { DeviceAction } from '@/device';
import type { PixelBbox, PlanningAction, Size } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { finalizePixelBbox } from '../../shared/model-locate-result/bbox';
import { mapLocateResultToPixelBboxByCoordinates } from '../../shared/model-locate-result/pixel-bbox-mapper';

const debug = getDebug('auto-glm-actions');

/**
 * Auto-GLM coordinate system range: [0, AUTO_GLM_COORDINATE_MAX]
 */
export const AUTO_GLM_COORDINATE_MAX = 1000;

type CoordinateDistanceAxis = 'x' | 'y';

function coordinateDistanceToPixels(
  delta: number,
  axis: CoordinateDistanceAxis,
  size: Size,
): number {
  const length = axis === 'x' ? size.width : size.height;
  return Math.round((Math.abs(delta) * length) / AUTO_GLM_COORDINATE_MAX);
}

function autoGLMPointToLocatedPixelBbox(
  point: [number, number],
  size: Size,
): PixelBbox {
  const ctx = { preparedSize: size };
  const pixelBbox = mapLocateResultToPixelBboxByCoordinates(
    { type: 'point', coordinates: point },
    ctx,
    { shape: 'point', order: 'xy', normalizedBy: AUTO_GLM_COORDINATE_MAX },
  );

  return finalizePixelBbox(pixelBbox, point, ctx);
}

export interface BaseAction {
  _metadata: string;
  think?: string;
}

export interface TapAction extends BaseAction {
  _metadata: 'do';
  action: 'Tap';
  element: [number, number];
}

export interface DoubleTapAction extends BaseAction {
  _metadata: 'do';
  action: 'Double Tap';
  element: [number, number];
}

export interface TypeAction extends BaseAction {
  _metadata: 'do';
  action: 'Type';
  text: string;
}

export interface SwipeAction extends BaseAction {
  _metadata: 'do';
  action: 'Swipe';
  start: [number, number];
  end: [number, number];
}

export interface LongPressAction extends BaseAction {
  _metadata: 'do';
  action: 'Long Press';
  element: [number, number];
}

export interface LaunchAction extends BaseAction {
  _metadata: 'do';
  action: 'Launch';
  app: string;
}

export interface BackAction extends BaseAction {
  _metadata: 'do';
  action: 'Back';
}

export interface HomeAction extends BaseAction {
  _metadata: 'do';
  action: 'Home';
}

export interface WaitAction extends BaseAction {
  _metadata: 'do';
  action: 'Wait';
  durationMs: number;
}

export interface InteractAction extends BaseAction {
  _metadata: 'do';
  action: 'Interact';
}

export interface CallAPIAction extends BaseAction {
  _metadata: 'do';
  action: 'Call_API';
  instruction: string;
}

export interface TakeoverAction extends BaseAction {
  _metadata: 'do';
  action: 'Take_over';
  message: string;
}

export interface NoteAction extends BaseAction {
  _metadata: 'do';
  action: 'Note';
  message: string;
}

export interface FinishAction extends BaseAction {
  _metadata: 'finish';
  message: string;
}

export type AutoGLMParsedAction =
  | TapAction
  | DoubleTapAction
  | TypeAction
  | SwipeAction
  | LongPressAction
  | LaunchAction
  | BackAction
  | HomeAction
  | WaitAction
  | InteractAction
  | CallAPIAction
  | TakeoverAction
  | NoteAction
  | FinishAction;

const BACK_BUTTON_NAMES = ['AndroidBackButton', 'HarmonyBackButton'];
const HOME_BUTTON_NAMES = ['AndroidHomeButton', 'HarmonyHomeButton'];

/**
 * Find the action name in actionSpace that matches one of the known names.
 * Falls back to defaultName if no match found or actionSpace is not provided.
 */
function findActionName(
  actionSpace: DeviceAction[] | undefined,
  knownNames: string[],
  defaultName: string,
): string {
  if (!actionSpace) return defaultName;
  const match = actionSpace.find((a) => knownNames.includes(a.name));
  return match ? match.name : defaultName;
}

export function transformAutoGLMAction(
  action: AutoGLMParsedAction,
  {
    actionSpace,
    shotSize,
  }: {
    actionSpace?: DeviceAction[];
    shotSize: Size;
  },
): PlanningAction[] {
  try {
    switch (action._metadata) {
      case 'finish': {
        const finishAction = action as FinishAction;
        debug('Transform finish action:', finishAction);
        return [
          {
            type: 'Finished',
            param: {},
            thought: finishAction.message,
          },
        ];
      }
      case 'do': {
        const doAction = action as
          | TapAction
          | DoubleTapAction
          | TypeAction
          | SwipeAction
          | LongPressAction
          | LaunchAction
          | BackAction
          | HomeAction
          | WaitAction
          | InteractAction
          | CallAPIAction
          | TakeoverAction
          | NoteAction;

        switch ((doAction as any).action) {
          case 'Tap': {
            const tapAction = doAction as TapAction;
            debug('Transform Tap action:', tapAction);

            return [
              {
                type: 'Tap',
                param: {
                  locate: {
                    locatedPixelBbox: autoGLMPointToLocatedPixelBbox(
                      tapAction.element,
                      shotSize,
                    ),
                    prompt: '',
                  },
                },
              },
            ];
          }
          case 'Double Tap': {
            const doubleTapAction = doAction as DoubleTapAction;
            debug('Transform Double Tap action:', doubleTapAction);

            return [
              {
                type: 'DoubleClick',
                param: {
                  locate: {
                    locatedPixelBbox: autoGLMPointToLocatedPixelBbox(
                      doubleTapAction.element,
                      shotSize,
                    ),
                    prompt: '',
                  },
                },
              },
            ];
          }
          case 'Type': {
            const typeAction = doAction as TypeAction;
            debug('Transform Type action:', typeAction);

            return [
              {
                type: 'Input',
                param: {
                  value: typeAction.text,
                },
              },
            ];
          }
          case 'Swipe': {
            const swipeAction = doAction as SwipeAction;
            debug('Transform Swipe action:', swipeAction);

            // Calculate horizontal and vertical delta in [0,AUTO_GLM_COORDINATE_MAX] coordinate system
            const deltaX = swipeAction.end[0] - swipeAction.start[0];
            const deltaY = swipeAction.end[1] - swipeAction.start[1];

            // Determine direction and distance
            let direction: 'up' | 'down' | 'left' | 'right';
            let distance: number;

            const absDeltaX = Math.abs(deltaX);
            const absDeltaY = Math.abs(deltaY);

            if (absDeltaY > absDeltaX) {
              // Vertical scroll
              distance = coordinateDistanceToPixels(deltaY, 'y', shotSize);
              direction = deltaY > 0 ? 'up' : 'down';
            } else {
              // Horizontal scroll
              distance = coordinateDistanceToPixels(deltaX, 'x', shotSize);
              direction = deltaX > 0 ? 'left' : 'right';
            }

            debug(
              `Calculate swipe direction: ${direction}, distance: ${distance}`,
            );

            return [
              {
                type: 'Scroll',
                param: {
                  locate: {
                    locatedPixelBbox: autoGLMPointToLocatedPixelBbox(
                      swipeAction.start,
                      shotSize,
                    ),
                    prompt: '',
                  },
                  // The scrolling direction here all refers to which direction of the page's content will appear on the screen.
                  distance,
                  direction,
                },
                thought: swipeAction.think || '',
              },
            ];
          }
          case 'Long Press': {
            const longPressAction = doAction as LongPressAction;
            debug('Transform Long Press action:', longPressAction);

            return [
              {
                type: 'LongPress',
                param: {
                  locate: {
                    locatedPixelBbox: autoGLMPointToLocatedPixelBbox(
                      longPressAction.element,
                      shotSize,
                    ),
                    prompt: '',
                  },
                },
                thought: longPressAction.think || '',
              },
            ];
          }
          case 'Back': {
            const backAction = doAction as BackAction;
            debug('Transform Back action:', backAction);
            return [
              {
                type: findActionName(
                  actionSpace,
                  BACK_BUTTON_NAMES,
                  'AndroidBackButton',
                ),
                param: {},
                thought: backAction.think || '',
              },
            ];
          }
          case 'Home': {
            const homeAction = doAction as HomeAction;
            debug('Transform Home action:', homeAction);
            return [
              {
                type: findActionName(
                  actionSpace,
                  HOME_BUTTON_NAMES,
                  'AndroidHomeButton',
                ),
                param: {},
                thought: homeAction.think || '',
              },
            ];
          }
          case 'Wait': {
            const waitAction = doAction as WaitAction;
            debug('Transform Wait action:', waitAction);
            return [
              {
                type: 'Sleep',
                param: {
                  timeMs: waitAction.durationMs,
                },
                thought: waitAction.think || '',
              },
            ];
          }
          case 'Launch': {
            const launchAction = doAction as LaunchAction;
            debug('Transform Launch action:', launchAction);
            return [
              {
                type: 'Launch',
                param: { uri: launchAction.app },
                thought: launchAction.think || '',
              },
            ];
          }
          case 'Interact': {
            throw new Error(
              `Action "Interact" from auto-glm is not supported in the current implementation.`,
            );
          }
          case 'Call_API': {
            throw new Error(
              `Action "Call_API" from auto-glm is not supported in the current implementation.`,
            );
          }
          case 'Take_over': {
            throw new Error(
              `Action "Take_over" from auto-glm is not supported in the current implementation.`,
            );
          }
          case 'Note': {
            throw new Error(
              `Action "Note" from auto-glm is not supported in the current implementation.`,
            );
          }
          default:
            throw new Error(
              `Unknown do() action type: ${(doAction as any).action}`,
            );
        }
      }
      default:
        throw new Error(
          `Unknown action metadata: ${(action as any)._metadata}`,
        );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debug('Transform error:', errorMessage);
    throw new Error(`Failed to transform action: ${errorMessage}`);
  }
}
