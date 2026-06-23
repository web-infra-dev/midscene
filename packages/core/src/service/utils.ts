import {
  AIResponseParseError,
  extractJSONFromCodeBlock,
} from '@/ai-model/service-caller';
import type { AIDescribeElementResponse } from '@/types';
import type { DumpMeta, PartialServiceDumpFromSDK, ServiceDump } from '@/types';
import { uuid } from '@midscene/shared/utils';

export function createServiceDump(
  data: PartialServiceDumpFromSDK,
): ServiceDump {
  const baseData: DumpMeta = {
    logTime: Date.now(),
  };
  const finalData: ServiceDump = {
    logId: uuid(),
    ...baseData,
    ...data,
  };

  return finalData;
}

function readNextSignificantChar(input: string, startIndex: number) {
  let index = startIndex;
  while (index < input.length && /\s/.test(input[index])) {
    index += 1;
  }
  return input[index];
}

function extractPossiblyMalformedStringField(input: string, fieldName: string) {
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fieldStart = new RegExp(`"${escapedFieldName}"\\s*:\\s*"`).exec(input);
  if (!fieldStart) {
    return undefined;
  }

  let index = fieldStart.index + fieldStart[0].length;
  let escaped = false;
  let valueForJsonParse = '';

  for (; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      valueForJsonParse += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      valueForJsonParse += char;
      escaped = true;
      continue;
    }

    if (char !== '"') {
      valueForJsonParse += char;
      continue;
    }

    const nextSignificantChar = readNextSignificantChar(input, index + 1);
    if (
      nextSignificantChar === ',' ||
      nextSignificantChar === '}' ||
      nextSignificantChar === ']' ||
      nextSignificantChar === undefined
    ) {
      try {
        return JSON.parse(`"${valueForJsonParse}"`);
      } catch {
        return valueForJsonParse;
      }
    }

    valueForJsonParse += '\\"';
  }

  return undefined;
}

export function recoverDescribeResponseFromParseError(
  error: unknown,
): Pick<AIDescribeElementResponse, 'description'> | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const rawResponse =
    error instanceof AIResponseParseError
      ? error.rawResponse
      : message.match(/Response -\s*\n\s*([\s\S]*)$/)?.[1];

  if (
    !rawResponse ||
    (!message.includes('failed to parse LLM response into JSON') &&
      !(error instanceof AIResponseParseError))
  ) {
    return undefined;
  }

  const jsonLikeResponse = extractJSONFromCodeBlock(rawResponse);
  const description = extractPossiblyMalformedStringField(
    jsonLikeResponse,
    'description',
  )?.trim();

  if (!description) {
    return undefined;
  }

  return { description };
}
