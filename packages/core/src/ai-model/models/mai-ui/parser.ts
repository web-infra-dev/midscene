import { assert } from '@midscene/shared/utils';

export interface MaiUiToolCall {
  name?: string;
  arguments: MaiUiAction;
}

export type MaiUiAction =
  | { action: 'click'; coordinate: number[] }
  | { action: 'double_click'; coordinate: number[] }
  | { action: 'long_press'; coordinate: number[] }
  | { action: 'type'; text: string }
  | { action: 'swipe'; direction?: string; coordinate?: number[] }
  | { action: 'drag'; start_coordinate: number[]; end_coordinate: number[] }
  | { action: 'open'; text: string }
  | { action: 'system_button'; button: string }
  | { action: 'wait' }
  | { action: 'terminate'; status?: string }
  | { action: 'answer'; text: string }
  | { action: string; [key: string]: any };

export interface MaiUiParsedPlanningResponse {
  rawResponse: string;
  thinking: string;
  toolCall: MaiUiToolCall;
  action: MaiUiAction;
}

function extractTaggedContent(
  text: string,
  tagName: string,
): string | undefined {
  const pattern = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 's');
  return text.match(pattern)?.[1]?.trim();
}

function normalizeThinkingTags(text: string): string {
  if (text.includes('</think>') && !text.includes('</thinking>')) {
    return `<thinking>${text.replace('</think>', '</thinking>')}`;
  }
  return text;
}

function parseToolCall(rawToolCall: string): MaiUiToolCall {
  const parsed = JSON.parse(rawToolCall) as MaiUiToolCall;
  assert(
    parsed && typeof parsed === 'object' && !Array.isArray(parsed),
    `MAI-UI tool_call must be an object, got ${rawToolCall}`,
  );
  assert(
    parsed.arguments &&
      typeof parsed.arguments === 'object' &&
      !Array.isArray(parsed.arguments),
    `MAI-UI tool_call.arguments must be an object, got ${rawToolCall}`,
  );
  assert(
    typeof parsed.arguments.action === 'string' &&
      parsed.arguments.action.length > 0,
    `MAI-UI action must be a non-empty string, got ${rawToolCall}`,
  );
  return parsed;
}

export function parseMaiUiPlanningResponse(
  rawResponse: string,
): MaiUiParsedPlanningResponse {
  const normalizedResponse = normalizeThinkingTags(rawResponse.trim());
  const rawToolCall = extractTaggedContent(normalizedResponse, 'tool_call');
  assert(rawToolCall, `Missing <tool_call> in MAI-UI response: ${rawResponse}`);

  const toolCall = parseToolCall(rawToolCall);
  return {
    rawResponse,
    thinking: extractTaggedContent(normalizedResponse, 'thinking') ?? '',
    toolCall,
    action: toolCall.arguments,
  };
}
