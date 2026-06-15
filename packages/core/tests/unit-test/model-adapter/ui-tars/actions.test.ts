import { transformUiTarsActions } from '@/ai-model/models/ui-tars/actions';
import type { UiTarsParsedPlanningResponse } from '@/ai-model/models/ui-tars/parser';
import type { PlanningAction } from '@/types';
import { describe, expect, it } from 'vitest';

const shotSize = {
  width: 1000,
  height: 800,
};

type UiTarsActionParam = {
  locate?: Record<string, unknown>;
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
  value?: string;
  keyName?: string;
  direction?: string;
  timeMs?: number;
};

function parsedResponse(
  actions: UiTarsParsedPlanningResponse['actions'],
  rawResponse = '',
): UiTarsParsedPlanningResponse {
  return {
    rawResponse,
    actions,
  };
}

function uiTarsAction(
  action_type: string,
  action_inputs: Record<string, unknown>,
  thought: string,
): UiTarsParsedPlanningResponse['actions'][number] {
  return {
    action_type,
    action_inputs,
    thought,
    reflection: null,
  } as UiTarsParsedPlanningResponse['actions'][number];
}

function firstAction(actions: PlanningAction[]) {
  expect(actions).toHaveLength(1);
  const action = actions[0];
  if (!action) {
    throw new Error('expected ui-tars action transform to return an action');
  }
  return action as PlanningAction<UiTarsActionParam>;
}

describe('transformUiTarsActions', () => {
  it('transforms click coordinates into locatedPixelBbox', () => {
    const action = firstAction(
      transformUiTarsActions(
        parsedResponse([
          uiTarsAction('click', { start_box: '[0.5,0.5]' }, 'Click submit'),
        ]),
        { shotSize },
      ),
    );

    expect(action).toMatchObject({
      type: 'Tap',
      param: {
        locate: {
          prompt: 'Click submit',
          locatedPixelBbox: [490, 392, 509, 407],
        },
      },
    });
    expect(action.param.locate).not.toHaveProperty('bbox');
  });

  it('transforms drag coordinates into locatedPixelBbox', () => {
    const action = firstAction(
      transformUiTarsActions(
        parsedResponse([
          uiTarsAction(
            'drag',
            { start_box: '[0.1,0.2]', end_box: '[0.3,0.4]' },
            'Drag item',
          ),
        ]),
        { shotSize },
      ),
    );

    expect(action).toMatchObject({
      type: 'DragAndDrop',
      param: {
        from: {
          prompt: 'Drag item',
          locatedPixelBbox: [90, 152, 110, 168],
        },
        to: {
          prompt: 'Drag item',
          locatedPixelBbox: [290, 312, 310, 328],
        },
      },
    });
    expect(action.param.from).not.toHaveProperty('bbox');
    expect(action.param.to).not.toHaveProperty('bbox');
  });

  it('transforms right and double click actions', () => {
    const actions = transformUiTarsActions(
      parsedResponse([
        uiTarsAction(
          'right_single',
          { start_box: '[0.2,0.25]' },
          'Open context menu',
        ),
        uiTarsAction('left_double', { start_box: '[0.25,0.3]' }, 'Open item'),
      ]),
      { shotSize },
    );

    expect(actions).toMatchObject([
      {
        type: 'RightClick',
        param: {
          locate: {
            prompt: 'Open context menu',
            locatedPixelBbox: [190, 192, 210, 208],
          },
        },
        thought: 'Open context menu',
      },
      {
        type: 'DoubleClick',
        param: {
          locate: {
            prompt: 'Open item',
            locatedPixelBbox: [240, 232, 260, 248],
          },
        },
        thought: 'Open item',
      },
    ]);
  });

  it('transforms type, scroll, hotkey, and wait actions', () => {
    const actions = transformUiTarsActions(
      parsedResponse([
        uiTarsAction('type', { content: 'hello world' }, 'Type a query'),
        uiTarsAction('scroll', { direction: 'down' }, 'Scroll results'),
        uiTarsAction('hotkey', { key: 'ctrl+a' }, 'Select all'),
        uiTarsAction('wait', {}, 'Wait for loading'),
      ]),
      { shotSize },
    );

    expect(actions).toMatchObject([
      {
        type: 'Input',
        param: { value: 'hello world' },
        thought: 'Type a query',
      },
      {
        type: 'Scroll',
        param: { direction: 'down' },
        thought: 'Scroll results',
      },
      {
        type: 'KeyboardPress',
        param: { keyName: 'ctrl+a' },
        thought: 'Select all',
      },
      {
        type: 'Sleep',
        param: { timeMs: 1000 },
        thought: 'Wait for loading',
      },
    ]);
  });

  it('transforms finished actions and stops planning in planner tests', () => {
    const action = firstAction(
      transformUiTarsActions(
        parsedResponse([
          uiTarsAction(
            'finished',
            { content: '已经将计数器加到3，任务完成。' },
            '',
          ),
        ]),
        { shotSize },
      ),
    );

    expect(action).toMatchObject({
      type: 'Finished',
      param: {},
      thought: '已经将计数器加到3，任务完成。',
    });
  });

  it('keeps click locatedPixelBbox inside inclusive image bounds', () => {
    const action = firstAction(
      transformUiTarsActions(
        parsedResponse([
          uiTarsAction('click', { start_box: '[1,1]' }, 'Click lower right'),
        ]),
        { shotSize },
      ),
    );

    expect(action).toMatchObject({
      type: 'Tap',
      param: {
        locate: {
          prompt: 'Click lower right',
          locatedPixelBbox: [989, 791, 999, 799],
        },
      },
    });
  });

  it('reports unhandled action types when no action is transformed', () => {
    expect(() =>
      transformUiTarsActions(
        parsedResponse([
          uiTarsAction('screenshot', {}, 'Use unsupported action'),
        ]),
        { shotSize },
      ),
    ).toThrow(/Unhandled action types: screenshot/);
  });

  it('reports missing hotkey key when no action is transformed', () => {
    expect(() =>
      transformUiTarsActions(
        parsedResponse([uiTarsAction('hotkey', {}, 'Missing key')]),
        { shotSize },
      ),
    ).toThrow(/No actions found in UI-TARS response/);
  });

  it('throws on invalid point data', () => {
    expect(() =>
      transformUiTarsActions(
        parsedResponse([
          uiTarsAction(
            'click',
            { start_box: '["abc",0.5]' },
            'Click invalid point',
          ),
        ]),
        { shotSize },
      ),
    ).toThrow(/invalid point data for ui-tars planning/);
  });
});
