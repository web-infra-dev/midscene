import { z } from '@midscene/core';
import {
  type AgentBehaviorInitArgs,
  agentBehaviorInitArgShape,
  extractAgentBehaviorInitArgs,
} from '@midscene/shared/agent-tools/agent-behavior-init-args';

export type WebAgentInitArgs = AgentBehaviorInitArgs & {
  url?: string;
};

export type WebCdpAgentInitArgs = WebAgentInitArgs & {
  extraHTTPHeaders?: Record<string, string>;
};

export const webAgentInitArgShape = {
  url: z
    .string()
    .url()
    .optional()
    .describe('URL to open in new tab (omit to use current page)'),
  ...agentBehaviorInitArgShape,
};

export const webCdpAgentInitArgShape = {
  ...webAgentInitArgShape,
  extraHTTPHeaders: z
    .record(z.string())
    .optional()
    .describe(
      'Extra HTTP headers sent with page requests in CDP mode. Pass a JSON object with string values.',
    ),
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

export function adaptWebCdpAgentInitArgs(
  extracted: Record<string, unknown> | undefined,
): WebCdpAgentInitArgs | undefined {
  if (!extracted) {
    return undefined;
  }

  const baseArgs = adaptWebAgentInitArgs(extracted);
  const extraHTTPHeaders = webCdpAgentInitArgShape.extraHTTPHeaders.parse(
    extracted.extraHTTPHeaders,
  );
  const initArgs: WebCdpAgentInitArgs = {
    ...(baseArgs ?? {}),
    ...(extraHTTPHeaders !== undefined ? { extraHTTPHeaders } : {}),
  };

  return Object.keys(initArgs).length > 0 ? initArgs : undefined;
}
