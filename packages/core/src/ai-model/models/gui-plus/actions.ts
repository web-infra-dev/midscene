import type { PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import type {
  DragAndDropPlanningAction,
  LocatePlanningAction,
  ScrollPlanningAction,
} from '../../shared/planning-action';

const debug = getDebug('gui-plus-actions');

export interface GuiPlusToolCall {
  name: 'computer_use' | string;
  arguments: GuiPlusComputerUseArguments;
  actionText?: string;
}

export type GuiPlusComputerUseAction =
  | 'key'
  | 'type'
  | 'mouse_move'
  | 'left_click'
  | 'click'
  | 'left_click_drag'
  | 'drag'
  | 'right_click'
  | 'middle_click'
  | 'double_click'
  | 'triple_click'
  | 'scroll'
  | 'hscroll'
  | 'wait'
  | 'terminate'
  | 'answer'
  | 'interact';

export interface GuiPlusComputerUseArguments {
  action: GuiPlusComputerUseAction | string;
  keys?: string[];
  text?: string;
  coordinate?: [number, number];
  coordinate2?: [number, number];
  pixels?: number;
  time?: number;
  status?: 'success' | 'failure' | string;
}

function locate(point: [number, number]) {
  return {
    point,
    prompt: '',
  };
}

function requireCoordinate(
  action: GuiPlusComputerUseArguments,
): [number, number] {
  if (!action.coordinate) {
    throw new Error(`Action "${action.action}" requires coordinate`);
  }
  return action.coordinate;
}

function requireCoordinate2(
  action: GuiPlusComputerUseArguments,
): [number, number] {
  if (!action.coordinate2) {
    throw new Error(`Action "${action.action}" requires coordinate2`);
  }
  return action.coordinate2;
}

function getScrollDistance(pixels: number): number {
  const absPixels = Math.abs(pixels);
  if (absPixels <= 10) {
    return absPixels * 100;
  }
  return absPixels;
}

export function transformGuiPlusComputerUseAction(
  toolCall: GuiPlusToolCall,
): PlanningAction[] {
  const action = toolCall.arguments;
  const thought = toolCall.actionText;
  debug('Transform GUI-Plus action:', toolCall);

  switch (action.action) {
    case 'left_click':
    case 'click': {
      return [
        {
          type: 'Tap',
          param: {
            locate: locate(requireCoordinate(action)),
          },
          thought,
        } satisfies LocatePlanningAction<'Tap'>,
      ];
    }
    case 'double_click':
    case 'triple_click': {
      return [
        {
          type: 'DoubleClick',
          param: {
            locate: locate(requireCoordinate(action)),
          },
          thought,
        } satisfies LocatePlanningAction<'DoubleClick'>,
      ];
    }
    case 'right_click': {
      return [
        {
          type: 'RightClick',
          param: {
            locate: locate(requireCoordinate(action)),
          },
          thought,
        } satisfies LocatePlanningAction<'RightClick'>,
      ];
    }
    case 'mouse_move': {
      return [
        {
          type: 'Hover',
          param: {
            locate: locate(requireCoordinate(action)),
          },
          thought,
        } satisfies LocatePlanningAction<'Hover'>,
      ];
    }
    case 'left_click_drag':
    case 'drag': {
      const from = requireCoordinate(action);
      const to = requireCoordinate2(action);
      return [
        {
          type: 'DragAndDrop',
          param: {
            from: locate(from),
            to: locate(to),
          },
          thought,
        } satisfies DragAndDropPlanningAction,
      ];
    }
    case 'type': {
      if (action.text === undefined) {
        throw new Error('Action "type" requires text');
      }
      return [
        {
          type: 'Input',
          param: {
            value: action.text,
          },
          thought,
        },
      ];
    }
    case 'key': {
      if (!action.keys || action.keys.length === 0) {
        throw new Error('Action "key" requires keys');
      }
      return [
        {
          type: 'KeyboardPress',
          param: {
            keyName: action.keys.join('+'),
          },
          thought,
        },
      ];
    }
    case 'scroll':
    case 'hscroll': {
      const pixels = action.pixels ?? 0;
      if (pixels === 0) {
        throw new Error(`Action "${action.action}" requires non-zero pixels`);
      }
      const direction =
        action.action === 'hscroll'
          ? pixels > 0
            ? 'left'
            : 'right'
          : pixels > 0
            ? 'up'
            : 'down';
      return [
        {
          type: 'Scroll',
          param: {
            locate: locate(action.coordinate ?? [500, 500]),
            direction,
            distance: getScrollDistance(pixels),
          },
          thought,
        } satisfies ScrollPlanningAction,
      ];
    }
    case 'wait': {
      return [
        {
          type: 'Sleep',
          param: {
            timeMs: Math.max(0, action.time ?? 2) * 1000,
          },
          thought,
        },
      ];
    }
    case 'terminate':
    case 'answer': {
      return [
        {
          type: 'Finished',
          param: {},
          thought: action.text || action.status || thought,
        },
      ];
    }
    case 'middle_click':
    case 'interact': {
      throw new Error(
        `Action "${action.action}" from gui-plus-2026-02-26 is not supported`,
      );
    }
    default:
      throw new Error(`Unknown GUI-Plus computer_use action: ${action.action}`);
  }
}
