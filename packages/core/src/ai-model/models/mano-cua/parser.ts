import { assert } from '@midscene/shared/utils';

export type ManoCuaActionName =
  | 'open_app'
  | 'open_url'
  | 'click'
  | 'doubleclick'
  | 'triple_click'
  | 'right_single'
  | 'hover'
  | 'type'
  | 'hotkey'
  | 'hotkey_click'
  | 'scroll'
  | 'drag'
  | 'wait'
  | 'finish'
  | 'stop'
  | 'call_user'
  | string;

export interface ManoCuaParsedAction {
  name: ManoCuaActionName;
  args: Record<string, string>;
  rawAction: string;
}

export interface ManoCuaParsedPlanningResponse {
  rawResponse: string;
  think: string;
  actionDescription: string;
  action: ManoCuaParsedAction;
}

export function extractManoCuaTaggedContent(
  text: string,
  tagName: string,
): string | undefined {
  const pattern = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 's');
  return text.match(pattern)?.[1]?.trim();
}

function parseActionArguments(rawArgs: string): Record<string, string> {
  const args: Record<string, string> = {};
  const argPattern = /([a-zA-Z_]\w*)\s*=\s*(['"])(.*?)\2/g;
  for (const match of rawArgs.matchAll(argPattern)) {
    args[match[1]] = match[3];
  }
  return args;
}

export function parseManoCuaActionCall(rawAction: string): ManoCuaParsedAction {
  const actionText = rawAction.trim();
  const match = actionText.match(/^([a-zA-Z_]\w*)\(([\s\S]*)\)$/);
  assert(match, `Invalid Mano-CUA action call: ${rawAction}`);

  return {
    name: match[1],
    args: parseActionArguments(match[2]),
    rawAction: actionText,
  };
}

export function parseManoCuaPlanningResponse(
  rawResponse: string,
): ManoCuaParsedPlanningResponse {
  const rawAction = extractManoCuaTaggedContent(rawResponse, 'action');
  assert(rawAction, `Missing <action> in Mano-CUA response: ${rawResponse}`);

  return {
    rawResponse,
    think: extractManoCuaTaggedContent(rawResponse, 'think') ?? '',
    actionDescription:
      extractManoCuaTaggedContent(rawResponse, 'action_desp') ?? '',
    action: parseManoCuaActionCall(rawAction),
  };
}
