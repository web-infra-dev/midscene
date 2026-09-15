import type { ParsedLocateResponse } from '../../model-adapter/locate-protocol';
import { SEED_TOOL_CALL_TAG_NAME } from './constants';
import {
  type RawDoubaoToolCall,
  parseDoubaoToolCalls,
} from './tool-call-parser';

const rawSeedToolCallPattern = new RegExp(
  `<${SEED_TOOL_CALL_TAG_NAME}\\b[^>]*>[\\s\\S]*?<\\/${SEED_TOOL_CALL_TAG_NAME}>`,
  'i',
);

const hasXmlTagMarker = (content: string, tagName: string) =>
  new RegExp(`(?:<${tagName}\\b|\\b${tagName}\\s*\\/?>)`, 'i').test(content);

const hasInnerXmlTagMarker = (content: string) =>
  ['function', 'parameter', 'point'].some((tagName) =>
    hasXmlTagMarker(content, tagName),
  );

const parseWithRawSeedToolCallFallback = (
  content: string,
  parse: (content: string) => ParsedLocateResponse,
): ParsedLocateResponse => {
  try {
    return parse(content);
  } catch (error) {
    const rawSeedToolCall = content.match(rawSeedToolCallPattern)?.[0];
    if (!rawSeedToolCall || !hasInnerXmlTagMarker(rawSeedToolCall)) {
      throw error;
    }

    return {
      kind: 'located',
      target: rawSeedToolCall,
    };
  }
};

const rawPointFromToolCall = (toolCall: RawDoubaoToolCall): string => {
  if (toolCall.functionName !== 'click') {
    throw new Error(
      `Doubao locate response requires a click function, but received "${toolCall.functionName}"`,
    );
  }

  const pointParameters = toolCall.parameters.filter(
    ({ name }) => name === 'point',
  );
  if (pointParameters.length !== 1) {
    throw new Error(
      'Doubao click function requires exactly one point parameter',
    );
  }

  const rawPoint = pointParameters[0].rawValue;
  if (!rawPoint.trim()) {
    throw new Error(
      'Doubao click function requires a non-empty point parameter',
    );
  }

  return rawPoint;
};

const roleFromToolCall = (toolCall: RawDoubaoToolCall): string => {
  const roleParameters = toolCall.parameters.filter(
    ({ name }) => name === 'role',
  );
  if (roleParameters.length !== 1) {
    throw new Error(
      'Doubao search-area click function requires exactly one role parameter',
    );
  }

  return roleParameters[0].rawValue.trim();
};

const parseLocateToolCalls = (content: string): ParsedLocateResponse => {
  const toolCalls = parseDoubaoToolCalls(content);
  if (toolCalls.length !== 1) {
    throw new Error(
      'Doubao locate response requires exactly one click function',
    );
  }

  return { kind: 'located', target: rawPointFromToolCall(toolCalls[0]) };
};

const parseSearchAreaToolCalls = (content: string): ParsedLocateResponse => {
  const locatedPoints = parseDoubaoToolCalls(content).map(
    (toolCall: RawDoubaoToolCall) => ({
      point: rawPointFromToolCall(toolCall),
      role: roleFromToolCall(toolCall),
    }),
  );
  const targets = locatedPoints.filter(({ role }) => role === 'target');
  if (targets.length !== 1) {
    throw new Error(
      'Doubao search-area response requires exactly one target click function',
    );
  }

  const references = locatedPoints
    .filter(({ role }) => role === 'reference')
    .map(({ point }) => point);

  return {
    kind: 'located',
    target: targets[0].point,
    ...(references.length > 0 ? { references } : {}),
  };
};

export const parseDoubaoLocateOutput = (
  content: string,
): ParsedLocateResponse =>
  parseWithRawSeedToolCallFallback(content, parseLocateToolCalls);

export const parseDoubaoSearchAreaOutput = (
  content: string,
): ParsedLocateResponse =>
  parseWithRawSeedToolCallFallback(content, parseSearchAreaToolCalls);
