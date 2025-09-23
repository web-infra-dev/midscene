import type {
  PlanningAIResponse,
  PlanningAction,
  Size,
  UIContext,
} from '@/types';
import { type IModelConfig, UITarsModelVersion } from '@midscene/shared/env';
import { resizeImgBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { transformHotkeyInput } from '@midscene/shared/us-keyboard-layout';
import { assert } from '@midscene/shared/utils';
import { actionParser } from '@ui-tars/action-parser';
import { AIActionType } from './common';
import type { ConversationHistory } from './conversation-history';
import { getSummary, getUiTarsPlanningPrompt } from './prompt/ui-tars-planning';
import { callAIWithStringResponse } from './service-caller/index';
type ActionType =
  | 'click'
  | 'drag'
  | 'type'
  | 'hotkey'
  | 'finished'
  | 'scroll'
  | 'wait';

const debug = getDebug('ui-tars-planning');
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

export async function uiTarsPlanning(
  userInstruction: string,
  options: {
    conversationHistory: ConversationHistory;
    context: UIContext;
    modelConfig: IModelConfig;
  },
): Promise<PlanningAIResponse> {
  const { conversationHistory, context, modelConfig } = options;
  const { uiTarsModelVersion } = modelConfig;
  const systemPrompt = getUiTarsPlanningPrompt() + userInstruction;

  const imagePayload = await resizeImageForUiTars(
    context.screenshotBase64,
    context.size,
    uiTarsModelVersion,
  );

  conversationHistory.append({
    role: 'user',
    content: [
      {
        type: 'image_url',
        image_url: {
          url: imagePayload,
        },
      },
    ],
  });

  const res = await callAIWithStringResponse(
    [
      {
        role: 'user',
        content: systemPrompt,
      },
      ...conversationHistory.snapshot(),
    ],
    AIActionType.INSPECT_ELEMENT,
    modelConfig,
  );
  const convertedText = convertBboxToCoordinates(res.content);

  const { size } = context;
  const { parsed } = actionParser({
    prediction: convertedText,
    factor: [1000, 1000],
    screenContext: {
      width: size.width,
      height: size.height,
    },
    modelVer: uiTarsModelVersion,
  });

  debug(
    'ui-tars modelVer',
    uiTarsModelVersion,
    ', parsed',
    JSON.stringify(parsed),
  );

  const transformActions: PlanningAction[] = [];
  let shouldContinue = true;
  parsed.forEach((action) => {
    const actionType = (action.action_type || '').toLowerCase();
    if (actionType === 'click') {
      assert(action.action_inputs.start_box, 'start_box is required');
      const point = getPoint(action.action_inputs.start_box, size);
      transformActions.push({
        type: 'Tap',
        param: {
          locate: {
            prompt: action.thought || '',
            bbox: pointToBbox(
              { x: point[0], y: point[1] },
              size.width,
              size.height,
            ),
          },
        },
      });
    } else if (actionType === 'drag') {
      assert(action.action_inputs.start_box, 'start_box is required');
      assert(action.action_inputs.end_box, 'end_box is required');
      const startPoint = getPoint(action.action_inputs.start_box, size);
      const endPoint = getPoint(action.action_inputs.end_box, size);
      transformActions.push({
        type: 'DragAndDrop',
        param: {
          from: {
            prompt: action.thought || '',
            bbox: pointToBbox(
              { x: startPoint[0], y: startPoint[1] },
              size.width,
              size.height,
            ),
          },
          to: {
            prompt: action.thought || '',
            bbox: pointToBbox(
              { x: endPoint[0], y: endPoint[1] },
              size.width,
              size.height,
            ),
          },
        },
        thought: action.thought || '',
      });
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
      shouldContinue = false;
      transformActions.push({
        type: 'Finished',
        param: {},
        thought: action.thought || '',
      });
    } else if (actionType === 'hotkey') {
      if (!action.action_inputs.key) {
        console.warn(
          'No key found in action: hotkey. Will not perform action.',
        );
      } else {
        const keys = transformHotkeyInput(action.action_inputs.key);

        transformActions.push({
          type: 'KeyboardPress',
          param: {
            keyName: keys,
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

  debug('transformActions', JSON.stringify(transformActions, null, 2));
  const log = getSummary(res.content);

  conversationHistory.append({
    role: 'assistant',
    content: log,
  });

  return {
    actions: transformActions,
    log,
    usage: res.usage,
    rawResponse: JSON.stringify(res.content, undefined, 2),
    more_actions_needed_by_instruction: shouldContinue,
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

export async function resizeImageForUiTars(
  imageBase64: string,
  size: Size,
  uiTarsVersion: UITarsModelVersion | undefined,
) {
  if (uiTarsVersion === UITarsModelVersion.V1_5) {
    debug('ui-tars-v1.5, will check image size', size);
    const currentPixels = size.width * size.height;
    const maxPixels = 16384 * 28 * 28; //
    if (currentPixels > maxPixels) {
      const resizeFactor = Math.sqrt(maxPixels / currentPixels);
      const newWidth = Math.floor(size.width * resizeFactor);
      const newHeight = Math.floor(size.height * resizeFactor);
      debug(
        'resize image for ui-tars, new width: %s, new height: %s',
        newWidth,
        newHeight,
      );
      const resizedImage = await resizeImgBase64(imageBase64, {
        width: newWidth,
        height: newHeight,
      });
      return resizedImage;
    }
  }
  return imageBase64;
}
