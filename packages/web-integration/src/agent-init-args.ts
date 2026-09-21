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

const httpHeaderEntrySchema = z.string().refine(
  (entry) => {
    const separatorIndex = entry.indexOf(':');
    return (
      separatorIndex > 0 &&
      /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(
        entry.slice(0, separatorIndex).trim(),
      )
    );
  },
  {
    message: 'Expected an HTTP header in "Name:Value" format.',
  },
);

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
  extraHttpHeader: z
    .union([httpHeaderEntrySchema, z.array(httpHeaderEntrySchema).min(1)])
    .optional()
    .describe(
      'Extra HTTP header sent with page requests in CDP mode, in "Name:Value" format. Repeat --extra-http-header to send multiple headers.',
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
  const extraHttpHeader = webCdpAgentInitArgShape.extraHttpHeader.parse(
    extracted.extraHttpHeader,
  );
  const headerEntries =
    typeof extraHttpHeader === 'string' ? [extraHttpHeader] : extraHttpHeader;
  const extraHTTPHeaders = headerEntries
    ? Object.fromEntries(
        headerEntries.map((entry) => {
          const separatorIndex = entry.indexOf(':');
          return [
            entry.slice(0, separatorIndex).trim(),
            entry.slice(separatorIndex + 1).trim(),
          ];
        }),
      )
    : undefined;
  const initArgs: WebCdpAgentInitArgs = {
    ...(baseArgs ?? {}),
    ...(extraHTTPHeaders !== undefined ? { extraHTTPHeaders } : {}),
  };

  return Object.keys(initArgs).length > 0 ? initArgs : undefined;
}
