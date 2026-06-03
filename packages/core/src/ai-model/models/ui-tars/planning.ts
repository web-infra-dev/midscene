import type {
  PlanningAIResponse,
  PlanningAction,
  PlanningLocateParamWithLocatedPixelBbox,
  Size,
} from '@/types';
import type { UITarsModelVersion } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { transformHotkeyInput } from '@midscene/shared/us-keyboard-layout';
import { assert } from '@midscene/shared/utils';
import { actionParser } from '@ui-tars/action-parser';
import {
  getSummary,
  getUiTarsPlanningPrompt,
} from '../../prompt/ui-tars-planning';
import {
  AIResponseParseError,
  callAIWithStringResponse,
} from '../../service-caller/index';
import { finalizePixelBbox } from '../../shared/model-locate-result/bbox';
import { mapLocateResultToPixelBboxByCoordinates } from '../../shared/model-locate-result/pixel-bbox-mapper';
import type { PlanOptions } from '../../workflows/planning/types';

type ActionType =
  | 'click'
  | 'left_double'
  | 'right_single'
  | 'drag'
  | 'type'
  | 'hotkey'
  | 'finished'
  | 'scroll'
  | 'wait';

const debug = getDebug('ui-tars-planning');
const warnLog = getDebug('ui-tars-planning', { console: true });

function pointToLocateParam(
  point: [number, number],
  thought: string | null,
  size: Size,
): PlanningLocateParamWithLocatedPixelBbox {
  const ctx = { preparedSize: size };
  const pixelBbox = mapLocateResultToPixelBboxByCoordinates(
    { type: 'point', coordinates: point },
    ctx,
    { shape: 'point', order: 'xy', normalizedBy: 1 },
  );

  return {
    prompt: thought || '',
    locatedPixelBbox: finalizePixelBbox(pixelBbox, point, ctx),
  };
}

export async function uiTarsPlanning(
  userInstruction: string,
  options: PlanOptions,
  uiTarsModelVersion: UITarsModelVersion,
): Promise<PlanningAIResponse> {
  const { conversationHistory, context, modelRuntime, actionContext } = options;

  let instruction = userInstruction;
  if (actionContext) {
    instruction = `<high_priority_knowledge>${actionContext}</high_priority_knowledge>\n<user_instruction>${userInstruction}</user_instruction>`;
  }

  const systemPrompt = getUiTarsPlanningPrompt() + instruction;

  const screenshotBase64 = context.screenshot.base64;

  conversationHistory.append({
    role: 'user',
    content: [
      {
        type: 'image_url',
        image_url: {
          url: screenshotBase64,
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
    modelRuntime,
    {
      abortSignal: options.abortSignal,
    },
  );

  let convertedText: string;
  let parsed: ReturnType<typeof actionParser>['parsed'];

  try {
    convertedText = convertBboxToCoordinates(res.content);

    const { shotSize } = context;
    const parseResult = actionParser({
      prediction: convertedText,
      factor: [1000, 1000],
      screenContext: {
        width: shotSize.width,
        height: shotSize.height,
      },
      modelVer: uiTarsModelVersion,
    });
    parsed = parseResult.parsed;
  } catch (parseError) {
    // Throw AIResponseParseError with usage and rawResponse preserved
    const errorMessage =
      parseError instanceof Error ? parseError.message : String(parseError);
    throw new AIResponseParseError(
      `Parse error: ${errorMessage}`,
      JSON.stringify(res.content, undefined, 2),
      res.usage,
    );
  }

  const { shotSize } = context;

  debug(
    'ui-tars modelVer',
    uiTarsModelVersion,
    ', parsed',
    JSON.stringify(parsed),
  );

  const transformActions: PlanningAction[] = [];
  const unhandledActions: Array<{ type: string; thought: string }> = [];
  let shouldContinue = true;
  parsed.forEach((action) => {
    const actionType = (action.action_type || '').toLowerCase();
    if (actionType === 'click') {
      assert(action.action_inputs.start_box, 'start_box is required');
      const point = getPoint(action.action_inputs.start_box);

      const locate = pointToLocateParam(point, action.thought, shotSize);

      transformActions.push({
        type: 'Tap',
        param: {
          locate,
        },
      });
    } else if (actionType === 'left_double') {
      assert(action.action_inputs.start_box, 'start_box is required');
      const point = getPoint(action.action_inputs.start_box);

      const locate = pointToLocateParam(point, action.thought, shotSize);

      transformActions.push({
        type: 'DoubleClick',
        param: {
          locate,
        },
        thought: action.thought || '',
      });
    } else if (actionType === 'right_single') {
      assert(action.action_inputs.start_box, 'start_box is required');
      const point = getPoint(action.action_inputs.start_box);

      const locate = pointToLocateParam(point, action.thought, shotSize);

      transformActions.push({
        type: 'RightClick',
        param: {
          locate,
        },
        thought: action.thought || '',
      });
    } else if (actionType === 'drag') {
      assert(action.action_inputs.start_box, 'start_box is required');
      assert(action.action_inputs.end_box, 'end_box is required');
      const startPoint = getPoint(action.action_inputs.start_box);
      const endPoint = getPoint(action.action_inputs.end_box);
      transformActions.push({
        type: 'DragAndDrop',
        param: {
          from: pointToLocateParam(startPoint, action.thought, shotSize),
          to: pointToLocateParam(endPoint, action.thought, shotSize),
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
      // Track unhandled action types
      unhandledActions.push({
        type: actionType,
        thought: action.thought || '',
      });
      debug('Unhandled action type:', actionType, 'thought:', action.thought);
    }
  });

  if (transformActions.length === 0) {
    const errorDetails: string[] = [];

    // Check if parsing failed
    if (parsed.length === 0) {
      errorDetails.push('Action parser returned no actions');

      // Check if response has Thought but no Action
      if (
        res.content.includes('Thought:') &&
        !res.content.includes('Action:')
      ) {
        errorDetails.push(
          'Response contains "Thought:" but missing "Action:" line',
        );
      } else {
        errorDetails.push('Response may be malformed or empty');
      }
    }

    // Check if we have unhandled action types
    if (unhandledActions.length > 0) {
      const types = unhandledActions.map((a) => a.type).join(', ');
      errorDetails.push(`Unhandled action types: ${types}`);
    }

    const errorMessage = [
      'No actions found in UI-TARS response.',
      ...errorDetails,
    ].join('\n');

    // Throw AIResponseParseError with usage and rawResponse preserved
    throw new AIResponseParseError(
      errorMessage,
      JSON.stringify(res.content, undefined, 2),
      res.usage,
    );
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
    shouldContinuePlanning: shouldContinue,
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

  // Remove common model wrappers before handing the response to UI-TARS parser.
  const cleanedText = text
    .replace(/\[EOS\]/g, '')
    .replace(/```(?:[a-zA-Z0-9_-]+)?/g, '');
  return cleanedText.replace(pattern, replaceMatch).trim();
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

interface LeftDoubleAction extends BaseAction {
  action_type: 'left_double';
  action_inputs: {
    start_box: string; // JSON string of [x, y] coordinates
  };
}

interface RightSingleAction extends BaseAction {
  action_type: 'right_single';
  action_inputs: {
    start_box: string; // JSON string of [x, y] coordinates
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
  action_inputs: {
    content?: string;
  };
}

export type Action =
  | ClickAction
  | LeftDoubleAction
  | RightSingleAction
  | DragAction
  | TypeAction
  | HotkeyAction
  | ScrollAction
  | FinishedAction
  | WaitAction;
