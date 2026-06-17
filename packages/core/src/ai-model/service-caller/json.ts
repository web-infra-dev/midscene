import { jsonrepair } from 'jsonrepair';

/**
 * Extract the JSON portion from a model response.
 *
 * This mainly handles fenced JSON like ```json { ... } ``` by removing the
 * fence. If that does not produce a JSON object, it falls back to a greedy regex
 * that extracts from the first "{" to the last "}". If that still fails, the
 * original response is returned.
 *
 * Expected model responses are JSON objects, possibly wrapped in markdown
 * fences. Natural language mixed with JSON, or arrays like
 * [{"type":"Tap"}, {"type":"Hover"}], are outside the supported contract and
 * are not reliably recoverable.
 *
 * This legacy extractor is also used by extraction responses that can be any
 * JSON value. In those cases, arrays/strings/numbers have no object braces and
 * pass through unchanged.
 */
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
  requireObject?: boolean;
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

function assertJsonObject(
  parsed: unknown,
): asserts parsed is Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `expected parsed LLM response to be a JSON object, got ${JSON.stringify(
        parsed,
      )}`,
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
  const requireObject = context?.requireObject ?? true;

  let parsedObj: unknown;

  try {
    parsedObj = parseJsonWithRepair(cleanJsonString);
    if (requireObject) {
      assertJsonObject(parsedObj);
    }
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
      if (requireObject) {
        assertJsonObject(parsedObj);
      }
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
