import type { PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { LatestLocateRecorder } from '../latest-locate-recorder';
import { AUTO_GLM_COORDINATE_MAX, autoGLMCoordinateToBbox } from './util';

const debug = getDebug('auto-glm-actions');
const lastLocateRecorder = new LatestLocateRecorder();

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

export type ParsedAction =
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

export function transformAutoGLMAction(
  action: ParsedAction,
  size: { width: number; height: number },
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
            const [x1, y1, x2, y2] = autoGLMCoordinateToBbox(
              tapAction.element[0],
              tapAction.element[1],
              size.width,
              size.height,
            );

            const locate: {
              prompt: string;
              bbox: [number, number, number, number];
            } = {
              prompt: '',
              bbox: [x1, y1, x2, y2],
            };
            lastLocateRecorder.recordLocate(locate, 'Tap');

            return [
              {
                type: 'Tap',
                param: {
                  locate,
                },
              },
            ];
          }
          case 'Double Tap': {
            const doubleTapAction = doAction as DoubleTapAction;
            debug('Transform Double Tap action:', doubleTapAction);
            const [x1, y1, x2, y2] = autoGLMCoordinateToBbox(
              doubleTapAction.element[0],
              doubleTapAction.element[1],
              size.width,
              size.height,
            );

            const locate: {
              prompt: string;
              bbox: [number, number, number, number];
            } = {
              prompt: '',
              bbox: [x1, y1, x2, y2],
            };
            lastLocateRecorder.recordLocate(locate, 'Double Tap');

            return [
              {
                type: 'DoubleClick',
                param: {
                  locate,
                },
              },
            ];
          }
          case 'Type': {
            const typeAction = doAction as TypeAction;
            debug('Transform Type action:', typeAction);
            const { locate: latestLocate, source } =
              lastLocateRecorder.getLatestLocate();
            debug(
              `use latestLocate from ${source} as locate when Input`,
              latestLocate,
            );

            return [
              {
                type: 'Input',
                param: {
                  value: typeAction.text,
                  locate: latestLocate,
                },
              },
            ];
          }
          case 'Swipe': {
            const swipeAction = doAction as SwipeAction;
            debug('Transform Swipe action:', swipeAction);

            // Calculate locate using start coordinate
            const [x1, y1, x2, y2] = autoGLMCoordinateToBbox(
              swipeAction.start[0],
              swipeAction.start[1],
              size.width,
              size.height,
            );

            const locate: {
              prompt: string;
              bbox: [number, number, number, number];
            } = {
              prompt: '',
              bbox: [x1, y1, x2, y2],
            };

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
              distance = Math.round(
                (absDeltaY * size.height) / AUTO_GLM_COORDINATE_MAX,
              );
              direction = deltaY > 0 ? 'up' : 'down';
            } else {
              // Horizontal scroll
              distance = Math.round(
                (absDeltaX * size.width) / AUTO_GLM_COORDINATE_MAX,
              );
              direction = deltaX > 0 ? 'left' : 'right';
            }

            debug(
              `Calculate swipe direction: ${direction}, distance: ${distance}`,
            );

            return [
              {
                type: 'Scroll',
                param: {
                  locate,
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
            const [x1, y1, x2, y2] = autoGLMCoordinateToBbox(
              longPressAction.element[0],
              longPressAction.element[1],
              size.width,
              size.height,
            );

            const locate: {
              prompt: string;
              bbox: [number, number, number, number];
            } = {
              prompt: '',
              bbox: [x1, y1, x2, y2],
            };
            lastLocateRecorder.recordLocate(locate, 'Long Press');

            return [
              {
                type: 'AndroidLongPress',
                param: {
                  locate,
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
                type: 'AndroidBackButton',
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
                type: 'AndroidHomeButton',
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
            throw new Error(
              `Action "Launch" from auto-glm is not supported in the current implementation.`,
            );
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
