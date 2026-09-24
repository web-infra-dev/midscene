import { SEED_TOOL_CALL_TAG_NAME } from './constants';
import { extractXmlAttribute } from './xml';

export type RawDoubaoParameter = {
  name: string;
  isString: boolean | undefined;
  rawValue: string;
};

export type RawDoubaoToolCall = {
  functionName: string;
  parameters: RawDoubaoParameter[];
};

const parseFunction = (
  attributes: string,
  content: string,
): RawDoubaoToolCall => {
  const functionName = extractXmlAttribute(attributes, 'name');
  if (!functionName) {
    throw new Error(
      `Failed to parse ${SEED_TOOL_CALL_TAG_NAME}: missing function name`,
    );
  }

  const parameterMatches = content.matchAll(
    /<parameter\b([^>]*)>([\s\S]*?)<\/parameter>/gi,
  );
  const parameters = Array.from(parameterMatches, (parameterMatch) => {
    const name = extractXmlAttribute(parameterMatch[1], 'name');
    const stringAttribute = extractXmlAttribute(parameterMatch[1], 'string');
    if (!name) {
      throw new Error(
        `Failed to parse ${SEED_TOOL_CALL_TAG_NAME}: parameter requires a name attribute`,
      );
    }

    if (
      stringAttribute !== undefined &&
      stringAttribute !== 'true' &&
      stringAttribute !== 'false'
    ) {
      throw new Error(
        `Failed to parse ${SEED_TOOL_CALL_TAG_NAME}: parameter requires a valid string attribute`,
      );
    }

    return {
      name,
      isString:
        stringAttribute === undefined ? undefined : stringAttribute === 'true',
      rawValue: parameterMatch[2],
    };
  });

  return { functionName, parameters };
};

export const parseDoubaoToolCalls = (content: string): RawDoubaoToolCall[] =>
  Array.from(
    content.matchAll(/<function\b([^>]*)>([\s\S]*?)<\/function>/gi),
    (functionMatch) => parseFunction(functionMatch[1], functionMatch[2]),
  );

export const parseDoubaoToolCall = (
  content: string,
): RawDoubaoToolCall | null => parseDoubaoToolCalls(content)[0] ?? null;
