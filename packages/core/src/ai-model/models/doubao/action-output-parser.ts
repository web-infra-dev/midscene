import type { PlanningAction } from '@/types';
import type { ParsedPlanningLocateParameter } from '../../model-adapter/planning-protocol';
import type { JsonParser } from '../../shared/json';
import { SEED_TOOL_CALL_TAG_NAME } from './constants';
import { extractXmlAttribute } from './xml';

const parseDoubaoParameterValue = (
  content: string,
  isString: boolean,
  jsonParser: JsonParser,
) => {
  if (isString) {
    return content;
  }

  return jsonParser(content, {
    source: 'planning-action-param',
    requireObject: false,
  });
};

export const parseDoubaoRawLocateParameter = (
  value: unknown,
): ParsedPlanningLocateParameter => {
  if (typeof value !== 'string') {
    throw new Error('Seed planning locator parameter must be a string');
  }

  const promptMatch = value.match(/<prompt>([\s\S]*?)<\/prompt>/i);
  const pointMatch = value.match(/<point>\s*(\d+)\s+(\d+)\s*<\/point>/i);
  if (!promptMatch && !pointMatch) {
    throw new Error(
      'Seed planning locator parameter requires <prompt> or <point>',
    );
  }

  const locateParameter: {
    prompt?: string;
    point?: [number, number];
  } = {};

  if (promptMatch) {
    locateParameter.prompt = promptMatch[1];
  }
  if (pointMatch) {
    locateParameter.point = [Number(pointMatch[1]), Number(pointMatch[2])];
  }

  return locateParameter;
};

export const createDoubaoPlanningActionOutputParser =
  (jsonParser: JsonParser) =>
  (content: string): PlanningAction | null => {
    const toolCallMatch = content.match(
      new RegExp(
        `<${SEED_TOOL_CALL_TAG_NAME}\\b[^>]*>([\\s\\S]*?)<\\/${SEED_TOOL_CALL_TAG_NAME}>`,
        'i',
      ),
    );
    if (!toolCallMatch) {
      return null;
    }

    const functionMatch = toolCallMatch[1].match(
      /<function\b([^>]*)>([\s\S]*?)<\/function>/i,
    );
    const actionName = functionMatch
      ? extractXmlAttribute(functionMatch[1], 'name')
      : undefined;
    if (!functionMatch || !actionName) {
      throw new Error(
        `Failed to parse ${SEED_TOOL_CALL_TAG_NAME}: missing function name`,
      );
    }

    const param: Record<string, unknown> = {};
    const parameterRegex = /<parameter\b([^>]*)>([\s\S]*?)<\/parameter>/gi;
    let parameterMatch = parameterRegex.exec(functionMatch[2]);
    while (parameterMatch) {
      const name = extractXmlAttribute(parameterMatch[1], 'name');
      const stringAttribute = extractXmlAttribute(parameterMatch[1], 'string');
      if (
        !name ||
        (stringAttribute !== 'true' && stringAttribute !== 'false')
      ) {
        throw new Error(
          `Failed to parse ${SEED_TOOL_CALL_TAG_NAME}: parameter requires name and string attributes`,
        );
      }

      try {
        param[name] = parseDoubaoParameterValue(
          parameterMatch[2],
          stringAttribute === 'true',
          jsonParser,
        );
      } catch (error) {
        throw new Error(`Failed to parse Seed parameter "${name}": ${error}`);
      }
      parameterMatch = parameterRegex.exec(functionMatch[2]);
    }

    return {
      type: actionName,
      ...(Object.keys(param).length > 0 ? { param } : {}),
    };
  };
