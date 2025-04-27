import type { PlanningAction } from '@/types';
import { uiTarsModelVersion } from '@midscene/shared/env';
import { transformHotkeyInput } from '@midscene/shared/keyboard-layout';
import { assert } from '@midscene/shared/utils';
import { actionParser } from '@ui-tars/action-parser';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { AIActionType } from './common';
import { getSummary, uiTarsPlanningPrompt } from './prompt/ui-tars-planning';
import { call } from './service-caller/index';
type ActionType =
  | 'click'
  | 'drag'
  | 'type'
  | 'hotkey'
  | 'finished'
  | 'scroll'
  | 'wait'
  | 'androidBackButton'
  | 'androidHomeButton'
  | 'androidRecentAppsButton';

const bboxSize = 10;
const pointToBbox = (
  point: { x: number; y: number },
  width: number,
  height: number,
): [number, number, number, number] => {
  return [
    Math.round(Math.max(point.x - bboxSize / 2, 0)),
    Math.round(Math.max(point.y - bboxSize / 2, 0)),
    Math.round(Math.min(point.x + bboxSize / 2, width)),
    Math.round(Math.min(point.y + bboxSize / 2, height)),
  ];
};

export async function vlmPlanning(options: {
  userInstruction: string;
  conversationHistory: ChatCompletionMessageParam[];
  size: { width: number; height: number };
}): Promise<{
  actions: PlanningAction<any>[];
  realActions: ReturnType<typeof actionParser>['parsed'];
  action_summary: string;
}> {
  const { conversationHistory, userInstruction, size } = options;
  const systemPrompt = uiTarsPlanningPrompt + userInstruction;

  const res = await call(
    [
      {
        role: 'user',
        content: systemPrompt,
      },
      ...conversationHistory,
    ],
    AIActionType.INSPECT_ELEMENT,
  );
  const convertedText = convertBboxToCoordinates(res.content);

  const modelVer = uiTarsModelVersion();
  const { parsed } = actionParser({
    prediction: convertedText,
    factor: [1000, 1000],
    screenContext: {
      width: size.width,
      height: size.height,
    },
    modelVer: modelVer || undefined,
  });
  const transformActions: PlanningAction[] = [];
  parsed.forEach((action) => {
    if (action.action_type === 'click') {
      assert(action.action_inputs.start_box, 'start_box is required');
      const point = getPoint(action.action_inputs.start_box, size);
      transformActions.push({
        type: 'Locate',
        param: {},
        locate: {
          prompt: action.thought || '',
          bbox: pointToBbox(
            { x: point[0], y: point[1] },
            size.width,
            size.height,
          ),
        },
      });
      transformActions.push({
        type: 'Tap',
        locate: {
          prompt: action.thought || '',
          bbox: pointToBbox(
            { x: point[0], y: point[1] },
            size.width,
            size.height,
          ),
        },
        param: action.thought || '',
      });
    } else if (action.action_type === 'drag') {
      assert(action.action_inputs.start_box, 'start_box is required');
      assert(action.action_inputs.end_box, 'end_box is required');
      const startPoint = getPoint(action.action_inputs.start_box, size);
      const endPoint = getPoint(action.action_inputs.end_box, size);
      transformActions.push({
        type: 'Drag',
        param: {
          start_box: { x: startPoint[0], y: startPoint[1] },
          end_box: { x: endPoint[0], y: endPoint[1] },
        },
        locate: null,
        thought: action.thought || '',
      });
    } else if (action.action_type === 'type') {
      transformActions.push({
        type: 'Input',
        param: {
          value: action.action_inputs.content,
        },
        locate: null,
        thought: action.thought || '',
      });
    } else if (action.action_type === 'scroll') {
      transformActions.push({
        type: 'Scroll',
        param: {
          direction: action.action_inputs.direction,
        },
        locate: null,
        thought: action.thought || '',
      });
    } else if (action.action_type === 'finished') {
      transformActions.push({
        type: 'Finished',
        param: {},
        locate: null,
        thought: action.thought || '',
      });
    } else if (action.action_type === 'hotkey') {
      assert(action.action_inputs.key, 'key is required');
      const keys = transformHotkeyInput(action.action_inputs.key);

      transformActions.push({
        type: 'KeyboardPress',
        param: {
          value: keys,
        },
        locate: null,
        thought: action.thought || '',
      });
    } else if (action.action_type === 'wait') {
      transformActions.push({
        type: 'Sleep',
        param: {
          timeMs: 1000,
        },
        locate: null,
        thought: action.thought || '',
      });
    } else if (action.action_type === 'androidBackButton') {
      transformActions.push({
        type: 'AndroidBackButton',
        param: {},
        locate: null,
        thought: action.thought || '',
      });
    } else if (action.action_type === 'androidHomeButton') {
      transformActions.push({
        type: 'AndroidHomeButton',
        param: {},
        locate: null,
        thought: action.thought || '',
      });
    } else if (action.action_type === 'androidRecentAppsButton') {
      transformActions.push({
        type: 'AndroidRecentAppsButton',
        param: {},
      });
    }
  });

  if (transformActions.length === 0) {
    throw new Error(`No actions found, response: ${res.content}`, {
      cause: {
        prediction: res.content,
        parsed,
      },
    });
  }

  return {
    actions: transformActions,
    realActions: parsed,
    action_summary: getSummary(res.content),
  };
}

/**
 * Converts bounding box notation to coordinate points
 * @param text - The text containing bbox tags to be converted
 * @returns The text with bbox tags replaced by coordinate points
 */
function convertBboxToCoordinates(text: string): string {
  // Match the four numbers after <bbox>
  const pattern = /<bbox>(\d+)\s+(\d+)\s+(\d+)\s+(\d+)<\/bbox>/g;

  function replaceMatch(
    match: string,
    x1: string,
    y1: string,
    x2: string,
    y2: string,
  ): string {
    // Convert strings to numbers and calculate center point
    const x1Num = Number.parseInt(x1, 10);
    const y1Num = Number.parseInt(y1, 10);
    const x2Num = Number.parseInt(x2, 10);
    const y2Num = Number.parseInt(y2, 10);

    // Use Math.floor to truncate and calculate center point
    const x = Math.floor((x1Num + x2Num) / 2);
    const y = Math.floor((y1Num + y2Num) / 2);

    // Return formatted coordinate string
    return `(${x},${y})`;
  }

  // Remove [EOS] and replace <bbox> coordinates
  const cleanedText = text.replace(/\[EOS\]/g, '');
  return cleanedText.replace(pattern, replaceMatch).trim();
}

function getPoint(startBox: string, size: { width: number; height: number }) {
  const [x, y] = JSON.parse(startBox);
  return [x * size.width, y * size.height];
}

interface BaseAction {
  action_type: ActionType;
  action_inputs: Record<string, any>;
  reflection: string | null;
  thought: string | null;
}

interface ClickAction extends BaseAction {
  action_type: 'click';
  action_inputs: {
    start_box: string; // JSON string of [x, y] coordinates
  };
}

interface DragAction extends BaseAction {
  action_type: 'drag';
  action_inputs: {
    start_box: string; // JSON string of [x, y] coordinates
    end_box: string; // JSON string of [x, y] coordinates
  };
}

interface WaitAction extends BaseAction {
  action_type: 'wait';
  action_inputs: {
    time: string; // JSON string of [x, y] coordinates
  };
}

interface TypeAction extends BaseAction {
  action_type: 'type';
  action_inputs: {
    content: string;
  };
}

interface HotkeyAction extends BaseAction {
  action_type: 'hotkey';
  action_inputs: {
    key: string;
  };
}

interface ScrollAction extends BaseAction {
  action_type: 'scroll';
  action_inputs: {
    direction: 'up' | 'down';
  };
}

interface FinishedAction extends BaseAction {
  action_type: 'finished';
  action_inputs: Record<string, never>;
}

export type Action =
  | ClickAction
  | DragAction
  | TypeAction
  | HotkeyAction
  | ScrollAction
  | FinishedAction
  | WaitAction;
