import { jsonrepair } from 'jsonrepair';

export type JsonParser = (raw: string) => unknown;

export function extractJSONFromCodeBlock(response: string) {
  try {
    const jsonMatch = response.match(/^\s*(\{[\s\S]*\})\s*$/);
    if (jsonMatch) {
      return jsonMatch[1];
    }

    const codeBlockMatch = response.match(
      /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
    );
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }

    const jsonLikeMatch = response.match(/\{[\s\S]*\}/);
    if (jsonLikeMatch) {
      return jsonLikeMatch[0];
    }
  } catch {}
  return response;
}

function normalizeJsonObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeJsonObject(item));
  }

  if (typeof obj === 'object') {
    const normalized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      const trimmedKey = key.trim();
      let normalizedValue = normalizeJsonObject(value);

      if (typeof normalizedValue === 'string') {
        normalizedValue = normalizedValue.trim();
      }

      normalized[trimmedKey] = normalizedValue;
    }

    return normalized;
  }

  if (typeof obj === 'string') {
    return obj.trim();
  }

  return obj;
}

const parseNormalJson = (input: string, rawResponse: string) => {
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
    return normalizeJsonObject(parsed);
  } catch (error) {
    lastError = error;
  }
  try {
    parsed = JSON.parse(jsonrepair(input));
    return normalizeJsonObject(parsed);
  } catch (error) {
    lastError = error;
  }

  return { parsed: undefined, lastError, rawResponse };
};

export function safeParseJson(raw: string) {
  const cleanJsonString = extractJSONFromCodeBlock(raw);
  const result = parseNormalJson(cleanJsonString, raw);
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
