import type { DeviceAction } from '@/device';
import type { PlanningAction } from '@/types';
import { transformHotkeyInput } from '@midscene/shared/us-keyboard-layout';
import { assert } from '@midscene/shared/utils';
import type {
  DragAndDropPlanningAction,
  LocatePlanningAction,
} from '../../shared/planning-action';

export type DoubaoXActionName =
  | 'click'
  | 'drag'
  | 'hotkey'
  | 'left_double'
  | 'right_single'
  | 'scroll'
  | 'type'
  | 'wait';

export interface DoubaoXFunctionDefinition {
  name: DoubaoXActionName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<
      string,
      { type: string; description: string; enum?: string[] }
    >;
    required: string[];
  };
}

export interface DoubaoXParsedAction {
  function: DoubaoXActionName;
  parameters: Record<string, string | number>;
}

const pointParameter = (description: string) => ({
  type: 'string',
  description: `${description} The format is: <point>x y</point>`,
});

const actionDefinitions: Record<DoubaoXActionName, DoubaoXFunctionDefinition> =
  {
    click: {
      name: 'click',
      description: 'Mouse left single click action.',
      parameters: {
        type: 'object',
        properties: { point: pointParameter('Click coordinates.') },
        required: ['point'],
      },
    },
    drag: {
      name: 'drag',
      description: 'Mouse left button drag action.',
      parameters: {
        type: 'object',
        properties: {
          start_point: pointParameter('Drag start point.'),
          end_point: pointParameter('Drag end point.'),
        },
        required: ['start_point', 'end_point'],
      },
    },
    hotkey: {
      name: 'hotkey',
      description: 'Press hotkey.',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description:
              'Hotkeys to press. Split keys with a space and use lowercase.',
          },
        },
        required: ['key'],
      },
    },
    left_double: {
      name: 'left_double',
      description: 'Mouse left double click action.',
      parameters: {
        type: 'object',
        properties: { point: pointParameter('Click coordinates.') },
        required: ['point'],
      },
    },
    right_single: {
      name: 'right_single',
      description: 'Mouse right single click action.',
      parameters: {
        type: 'object',
        properties: { point: pointParameter('Click coordinates.') },
        required: ['point'],
      },
    },
    scroll: {
      name: 'scroll',
      description: 'Scroll action.',
      parameters: {
        type: 'object',
        properties: {
          point: pointParameter('Scroll target position.'),
          direction: {
            type: 'string',
            description: 'Scroll direction.',
            enum: ['up', 'down', 'left', 'right'],
          },
        },
        required: ['direction', 'point'],
      },
    },
    type: {
      name: 'type',
      description: 'Type content into the currently focused input.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Type content. Use \\n at the end to submit.',
          },
        },
        required: ['content'],
      },
    },
    wait: {
      name: 'wait',
      description: 'Wait for a while.',
      parameters: {
        type: 'object',
        properties: {
          time: { type: 'integer', description: 'Wait time in seconds.' },
        },
        required: [],
      },
    },
  };

const actionNameByMidsceneAction: Array<[string, DoubaoXActionName]> = [
  ['Tap', 'click'],
  ['DragAndDrop', 'drag'],
  ['KeyboardPress', 'hotkey'],
  ['DoubleClick', 'left_double'],
  ['RightClick', 'right_single'],
  ['Scroll', 'scroll'],
  ['Input', 'type'],
  ['Sleep', 'wait'],
];

export function getDoubaoXFunctionDefinitions(
  actionSpace: DeviceAction[],
): DoubaoXFunctionDefinition[] {
  const availableActions = new Set(actionSpace.map((action) => action.name));
  return actionNameByMidsceneAction
    .filter(([midsceneAction]) => availableActions.has(midsceneAction))
    .map(([, doubaoXAction]) => actionDefinitions[doubaoXAction]);
}

function parsePoint(value: unknown, name: string): [number, number] {
  assert(typeof value === 'string', `${name} must be a point string`);
  const match = value.match(
    /^\s*<point>\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*<\/point>\s*$/,
  );
  assert(match, `${name} must use <point>x y</point>, got ${value}`);
  return [Number(match[1]), Number(match[2])];
}

function actionAvailable(actionSpace: DeviceAction[], name: string): void {
  assert(
    actionSpace.some((action) => action.name === name),
    `Doubao-X returned ${name}, but it is unavailable in the current actionSpace`,
  );
}

export function transformDoubaoXActions(
  actions: DoubaoXParsedAction[],
  actionSpace: DeviceAction[],
): PlanningAction[] {
  return actions.map((action) => {
    switch (action.function) {
      case 'click':
        actionAvailable(actionSpace, 'Tap');
        return {
          type: 'Tap',
          param: {
            locate: {
              point: parsePoint(action.parameters.point, 'point'),
              prompt: '',
            },
          },
        } satisfies LocatePlanningAction<'Tap'>;
      case 'left_double':
        actionAvailable(actionSpace, 'DoubleClick');
        return {
          type: 'DoubleClick',
          param: {
            locate: {
              point: parsePoint(action.parameters.point, 'point'),
              prompt: '',
            },
          },
        } satisfies LocatePlanningAction<'DoubleClick'>;
      case 'right_single':
        actionAvailable(actionSpace, 'RightClick');
        return {
          type: 'RightClick',
          param: {
            locate: {
              point: parsePoint(action.parameters.point, 'point'),
              prompt: '',
            },
          },
        } satisfies LocatePlanningAction<'RightClick'>;
      case 'drag':
        actionAvailable(actionSpace, 'DragAndDrop');
        return {
          type: 'DragAndDrop',
          param: {
            from: {
              point: parsePoint(action.parameters.start_point, 'start_point'),
              prompt: '',
            },
            to: {
              point: parsePoint(action.parameters.end_point, 'end_point'),
              prompt: '',
            },
          },
        } satisfies DragAndDropPlanningAction;
      case 'type':
        actionAvailable(actionSpace, 'Input');
        assert(
          typeof action.parameters.content === 'string',
          'content must be a string',
        );
        return {
          type: 'Input',
          param: { value: action.parameters.content, mode: 'typeOnly' },
        };
      case 'hotkey': {
        actionAvailable(actionSpace, 'KeyboardPress');
        assert(
          typeof action.parameters.key === 'string',
          'key must be a string',
        );
        return {
          type: 'KeyboardPress',
          param: {
            keyName: transformHotkeyInput(action.parameters.key).join('+'),
          },
        };
      }
      case 'scroll':
        actionAvailable(actionSpace, 'Scroll');
        assert(
          typeof action.parameters.direction === 'string',
          'direction must be a string',
        );
        assert(
          ['up', 'down', 'left', 'right'].includes(action.parameters.direction),
          'invalid scroll direction',
        );
        return {
          type: 'Scroll',
          param: {
            locate: {
              point: parsePoint(action.parameters.point, 'point'),
              prompt: '',
            },
            direction: action.parameters.direction as
              | 'up'
              | 'down'
              | 'left'
              | 'right',
          },
        };
      case 'wait': {
        actionAvailable(actionSpace, 'Sleep');
        const seconds = Number(action.parameters.time ?? 5);
        assert(
          Number.isFinite(seconds) && seconds >= 0,
          'time must be a non-negative number',
        );
        return { type: 'Sleep', param: { timeMs: seconds * 1000 } };
      }
    }
  });
}
