import { jsonrepair } from 'jsonrepair';

export function extractJSONFromCodeBlock(response: string) {
  try {
    // First, try to match a JSON object directly in the response
    const jsonMatch = response.match(/^\s*(\{[\s\S]*\})\s*$/);
    if (jsonMatch) {
      return jsonMatch[1];
    }

    // If no direct JSON object is found, try to extract JSON from a code block
    const codeBlockMatch = response.match(
      /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
    );
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }

    // If no code block is found, try to find a JSON-like structure in the text
    const jsonLikeMatch = response.match(/\{[\s\S]*\}/);
    if (jsonLikeMatch) {
      return jsonLikeMatch[0];
    }
  } catch {}
  // If no JSON-like structure is found, return the original response
  return response;
}

export type JsonParserSource =
  | 'generic-object'
  | 'planning-action-param'
  | 'locate'
  | 'section-locator';

export interface JsonParserContext {
  source: JsonParserSource;
  preserveStringValueKeys?: string[];
}

export type JsonParser = (raw: string, context?: JsonParserContext) => unknown;

/**
 * Normalize a parsed JSON object by trimming whitespace from:
 * 1. All object keys (e.g., " prompt " -> "prompt")
 * 2. All string values (e.g., " Tap " -> "Tap")
 * This handles LLM output that may include leading/trailing spaces.
 */
function normalizeJsonObject(
  obj: any,
  context: Pick<JsonParserContext, 'preserveStringValueKeys'> = {},
): any {
  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays - recursively normalize each element
  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeJsonObject(item, context));
  }

  // Handle objects
  if (typeof obj === 'object') {
    const normalized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      // Trim the key to remove leading/trailing spaces
      const trimmedKey = key.trim();
      const preserveStringValue =
        context.preserveStringValueKeys?.includes(trimmedKey) ?? false;

      const normalizedValue =
        typeof value === 'string'
          ? preserveStringValue
            ? value
            : value.trim()
          : normalizeJsonObject(value, context);

      normalized[trimmedKey] = normalizedValue;
    }

    return normalized;
  }

  // Handle primitive strings
  if (typeof obj === 'string') {
    return obj.trim();
  }

  // Return other primitives as-is
  return obj;
}

const parseNormalJson = (
  input: string,
  rawResponse: string,
  context?: JsonParserContext,
) => {
  if (input?.match(/\((\d+),(\d+)\)/)) {
    return input
      .match(/\((\d+),(\d+)\)/)
      ?.slice(1)
      .map(Number);
  }

  let parsed: any;
  let lastError: unknown;
  try {
    parsed = JSON.parse(input);
    return normalizeJsonObject(parsed, context);
  } catch (error) {
    lastError = error;
  }
  try {
    parsed = JSON.parse(jsonrepair(input));
    return normalizeJsonObject(parsed, context);
  } catch (error) {
    lastError = error;
  }

  return { parsed: undefined, lastError, rawResponse };
};

export function safeParseJson(raw: string, context?: JsonParserContext) {
  const cleanJsonString = extractJSONFromCodeBlock(raw);
  const result = parseNormalJson(cleanJsonString, raw, context);
  if (
    result &&
    typeof result === 'object' &&
    'parsed' in result &&
    result.parsed === undefined
  ) {
    throw Error(
      `failed to parse LLM response into JSON. Error - ${String(
        result.lastError ?? 'unknown error',
      )}. Response - \n ${raw}`,
    );
  }
  return result;
}

export const normalJsonParser: JsonParser = safeParseJson;
