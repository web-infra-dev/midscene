import { z } from '@midscene/core';
import {
  type AgentBehaviorInitArgs,
  agentBehaviorInitArgShape,
  extractAgentBehaviorInitArgs,
} from '@midscene/shared/mcp/agent-behavior-init-args';

export type WebAgentInitArgs = AgentBehaviorInitArgs & {
  url?: string;
};

export const webAgentInitArgShape = {
  url: z
    .string()
    .url()
    .optional()
    .describe('URL to open in new tab (omit to use current page)'),
  ...agentBehaviorInitArgShape,
};

export function adaptWebAgentInitArgs(
  extracted: Record<string, unknown> | undefined,
): WebAgentInitArgs | undefined {
  if (!extracted) {
    return undefined;
  }

  const initArgs: WebAgentInitArgs = {
    ...(typeof extracted.url === 'string' ? { url: extracted.url } : {}),
    ...(extractAgentBehaviorInitArgs(extracted as AgentBehaviorInitArgs) ?? {}),
  };

  return Object.keys(initArgs).length > 0 ? initArgs : undefined;
}
