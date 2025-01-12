import type { UIContext } from '@/types';
import type { PlanningAction } from '@/types';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { AIActionType } from './common';
import { call, callToGetJSONObject } from './openai';
import {
  getSummary,
  parseActionVlm,
  planToTargetPrompt,
} from './prompt/plan-to-target';
import { describeUserPage } from './prompt/util';

type ActionType = 'click' | 'type' | 'hotkey' | 'finished' | 'scroll' | 'wait';

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function planToTarget(options: {
  userInstruction: string;
  conversationHistory: ChatCompletionMessageParam[];
  size: { width: number; height: number };
}): Promise<{
  actions: PlanningAction<any>[];
  realActions: Array<Action>;
  action_summary: string;
}> {
  const { conversationHistory, userInstruction, size } = options;
  const systemPrompt = planToTargetPrompt + userInstruction;

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
  const actions = parseActionVlm(res.content);
  const transformActions: PlanningAction[] = [];
  actions.forEach((action) => {
    if (action.action_type === 'click') {
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
          timeMs: action.action_inputs.time,
        },
        locate: null,
        thought: action.thought || '',
      });
    }
  });
  console.log('planToTarget:', {
    original: res.content,
    actions,
    transformActions,
  });
  return {
    actions: transformActions,
    realActions: actions,
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
  | TypeAction
  | HotkeyAction
  | ScrollAction
  | FinishedAction
  | WaitAction;
