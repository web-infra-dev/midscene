import { jsonrepair } from 'jsonrepair';

/**
 * Preserve complete JSON values and remove optional markdown fences before
 * parsing. Keep array boundaries intact, including when the contents need repair.
 * For prose mixed with JSON, fall back to extracting the first through last
 * object brace; arbitrary prose with arrays is not a supported format.
 */
export function extractJSONFromCodeBlock(response: string) {
  try {
    JSON.parse(response);
    return response.trim();
  } catch {
    // Invalid JSON may still be recoverable after extraction and repair.
  }

  try {
    // Preserve complete object and array boundaries for jsonrepair.
    const jsonMatch = response.match(/^\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*$/);
    if (jsonMatch) {
      return jsonMatch[1];
    }

    // If no direct JSON object is found, try to extract JSON from a code block
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
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
 * Trim whitespace in parsed JSON by normalizing:
 * 1. All object keys (e.g., " prompt " -> "prompt")
 * 2. All string values (e.g., " Tap " -> "Tap")
 * This handles LLM output that may include leading/trailing spaces.
 */
function trimParsedJsonStrings(
  obj: any,
  context: Pick<JsonParserContext, 'preserveStringValueKeys'> = {},
): any {
  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays - recursively normalize each element
  if (Array.isArray(obj)) {
    return obj.map((item) => trimParsedJsonStrings(item, context));
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
          : trimParsedJsonStrings(value, context);

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

function repairKnownJsonIssues(
  jsonBlock: string,
  _rawResponse: string,
): string {
  // TODO: Add project-specific repairs that jsonrepair cannot handle.
  return jsonBlock;
}

export function assertJsonObject(
  parsed: unknown,
): asserts parsed is Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const parsedType = Array.isArray(parsed)
      ? 'array'
      : parsed === null
        ? 'null'
        : typeof parsed;
    throw new Error(
      `LLM response is valid JSON but does not match the expected schema. Expected to be a JSON object, got ${parsedType}: ${JSON.stringify(parsed)}.`,
    );
  }
}

function parseJsonWithRepair(jsonStr: string) {
  try {
    return JSON.parse(jsonStr);
  } catch {
    return JSON.parse(jsonrepair(jsonStr));
  }
}

export function parseModelResponseJson(
  raw: string,
  context?: JsonParserContext,
) {
  const cleanJsonString = extractJSONFromCodeBlock(raw);

  let parsedObj: unknown;

  try {
    parsedObj = parseJsonWithRepair(cleanJsonString);
  } catch (e1) {
    const code = repairKnownJsonIssues(cleanJsonString, raw);
    if (code === cleanJsonString) {
      throw new Error(
        `failed to parse LLM response into JSON. Error - ${String(
          e1,
        )}. Response - \n ${raw}`,
      );
    }

    try {
      parsedObj = parseJsonWithRepair(code);
    } catch (e2) {
      throw new Error(
        `failed to parse LLM response into JSON. First error - ${String(
          e1,
        )}. Second error - ${String(e2)}. Response - \n ${raw}`,
      );
    }
  }

  return trimParsedJsonStrings(parsedObj, context);
}
