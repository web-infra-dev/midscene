import type { Size } from '@/types';
import type { UITarsModelVersion } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { actionParser } from '@ui-tars/action-parser';

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

export interface UiTarsParsedPlanningResponse {
  rawResponse: string;
  actions: ReturnType<typeof actionParser>['parsed'];
}

export function parseUiTarsPlanningResponse(
  rawResponse: string,
  shotSize: Size,
  uiTarsModelVersion: UITarsModelVersion,
): UiTarsParsedPlanningResponse {
  const convertedText = convertBboxToCoordinates(rawResponse);
  const parseResult = actionParser({
    prediction: convertedText,
    factor: [1000, 1000],
    screenContext: {
      width: shotSize.width,
      height: shotSize.height,
    },
    modelVer: uiTarsModelVersion,
  });

  debug(
    'ui-tars modelVer',
    uiTarsModelVersion,
    ', parsed',
    JSON.stringify(parseResult.parsed),
  );

  return {
    rawResponse,
    actions: parseResult.parsed,
  };
}

/**
 * Converts bounding box notation to coordinate points.
 */
function convertBboxToCoordinates(text: string): string {
  const pattern = /<bbox>(\d+)\s+(\d+)\s+(\d+)\s+(\d+)<\/bbox>/g;

  function replaceMatch(
    match: string,
    x1: string,
    y1: string,
    x2: string,
    y2: string,
  ): string {
    const x1Num = Number.parseInt(x1, 10);
    const y1Num = Number.parseInt(y1, 10);
    const x2Num = Number.parseInt(x2, 10);
    const y2Num = Number.parseInt(y2, 10);

    const x = Math.floor((x1Num + x2Num) / 2);
    const y = Math.floor((y1Num + y2Num) / 2);

    return `(${x},${y})`;
  }

  const cleanedText = text
    .replace(/\[EOS\]/g, '')
    .replace(/```(?:[a-zA-Z0-9_-]+)?/g, '');
  return cleanedText.replace(pattern, replaceMatch).trim();
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
    start_box: string;
  };
}

interface DragAction extends BaseAction {
  action_type: 'drag';
  action_inputs: {
    start_box: string;
    end_box: string;
  };
}

interface WaitAction extends BaseAction {
  action_type: 'wait';
  action_inputs: {
    time: string;
  };
}

interface LeftDoubleAction extends BaseAction {
  action_type: 'left_double';
  action_inputs: {
    start_box: string;
  };
}

interface RightSingleAction extends BaseAction {
  action_type: 'right_single';
  action_inputs: {
    start_box: string;
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
