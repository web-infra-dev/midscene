import assert from 'node:assert';
import type { PlanningAction } from '@/types';
import { actionParser } from '@ui-tars/action-parser';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { AIActionType } from './common';
import { getSummary, uiTarsPlanningPrompt } from './prompt/ui-tars-planning';
import { call } from './service-caller';

type ActionType =
  | 'click'
  | 'drag'
  | 'type'
  | 'hotkey'
  | 'finished'
  | 'scroll'
  | 'wait';

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

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
  const { parsed } = actionParser({
    prediction: res.content,
    factor: 1000,
  });
  const transformActions: PlanningAction[] = [];
  parsed.forEach((action) => {
    if (action.action_type === 'click') {
      assert(action.action_inputs.start_box, 'start_box is required');
      const point = getPoint(action.action_inputs.start_box, size);
      transformActions.push({
        type: 'Locate',
        locate: {
          prompt: action.thought || '',
          position: { x: point[0], y: point[1] },
        },
        param: {
          // action,
          // position: { x: point[0], y: point[1] },
        },
      });
      transformActions.push({
        type: 'Tap',
        locate: {
          prompt: action.thought || '',
          position: { x: point[0], y: point[1] },
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
      const keys = action.action_inputs.key.split(',');
      for (const key of keys) {
        // await playwrightPage.keyboard.press(capitalize(key) as any);
        transformActions.push({
          type: 'KeyboardPress',
          param: {
            value: capitalize(key),
          },
          locate: null,
          thought: action.thought || '',
        });
      }
    } else if (action.action_type === 'wait') {
      transformActions.push({
        type: 'Sleep',
        param: {
          timeMs: 1000,
        },
        locate: null,
        thought: action.thought || '',
      });
    }
  });
  return {
    actions: transformActions,
    realActions: parsed,
    action_summary: getSummary(res.content),
  };
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
