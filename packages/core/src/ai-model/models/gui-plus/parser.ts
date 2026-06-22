import { getDebug } from '@midscene/shared/logger';
import type { GuiPlusToolCall } from './actions';

const debug = getDebug('gui-plus-parser');

function extractActionText(content: string): string | undefined {
  const actionMatch = content.match(/(?:^|\n)\s*Action:\s*([\s\S]*?)(?=\n\s*<tool_call>)/i);
  return actionMatch?.[1]?.trim();
}

function extractToolCallBlocks(content: string): string[] {
  const pattern = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function validateGuiPlusToolCall(value: unknown): GuiPlusToolCall {
  if (!value || typeof value !== 'object') {
    throw new Error(`Tool call must be an object, got ${typeof value}`);
  }

  const toolCall = value as Partial<GuiPlusToolCall>;
  if (typeof toolCall.name !== 'string') {
    throw new Error('Tool call "name" must be a string');
  }
  if (!toolCall.arguments || typeof toolCall.arguments !== 'object') {
    throw new Error('Tool call "arguments" must be an object');
  }
  if (typeof toolCall.arguments.action !== 'string') {
    throw new Error('Tool call "arguments.action" must be a string');
  }

  return toolCall as GuiPlusToolCall;
}

export function parseGuiPlusPlanningResponse(content: string): {
  actionText?: string;
  toolCalls: GuiPlusToolCall[];
} {
  debug('GUI-Plus raw response:', content);
  const actionText = extractActionText(content);
  const blocks = extractToolCallBlocks(content);

  if (blocks.length === 0) {
    throw new Error(`No <tool_call> block found in GUI-Plus response`);
  }

  const toolCalls = blocks.map((block) => {
    try {
      const parsed = JSON.parse(block);
      return {
        ...validateGuiPlusToolCall(parsed),
        actionText,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse GUI-Plus <tool_call>: ${message}; raw="${block}"`,
      );
    }
  });

  return { actionText, toolCalls };
}
