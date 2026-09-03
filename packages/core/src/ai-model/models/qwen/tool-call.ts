import type { DeviceAction, PlanningAction } from '@/types';
import {
  isMidsceneLocatorField,
  unwrapZodField,
} from '@midscene/shared/zod-schema-utils';
import type {
  ParsedPlanningLocateParameter,
  PlanningActionOutputBuildInput,
} from '../../model-adapter/planning-protocol';
import type { JsonParser } from '../../shared/json';

const TOOL_CALL_TAG_NAME = 'tool_call';

const serializeParameterValue = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  const serializedValue = JSON.stringify(value);
  if (serializedValue === undefined) {
    throw new Error('Failed to serialize Qwen parameter value');
  }
  return serializedValue;
};

export const serializeQwenToolCall = ({
  functionName,
  parameters,
}: {
  functionName: string;
  parameters: Array<{ name: string; value: unknown }>;
}) => {
  const serializedParameters = parameters
    .map(
      ({ name, value }) =>
        `<parameter=${name}>\n${serializeParameterValue(value)}\n</parameter>`,
    )
    .join('\n');

  return `<${TOOL_CALL_TAG_NAME}>\n<function=${functionName}>${
    serializedParameters ? `\n${serializedParameters}\n` : '\n'
  }</function>\n</${TOOL_CALL_TAG_NAME}>`;
};

export const buildQwenPlanningActionOutput = ({
  actionName,
  param,
  locateFields = [],
  locateResultKey,
}: PlanningActionOutputBuildInput) => {
  const locateFieldSet = new Set(locateFields);
  return serializeQwenToolCall({
    functionName: actionName,
    parameters: Object.entries(param)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => ({
        name,
        value: locateFieldSet.has(name)
          ? serializeLocateParameter(value, locateResultKey)
          : value,
      })),
  });
};

const serializeLocateParameter = (
  value: unknown,
  locateResultKey: string | undefined,
) => {
  if (
    !value ||
    typeof value !== 'object' ||
    !('prompt' in value) ||
    typeof value.prompt !== 'string'
  ) {
    throw new Error(
      'Failed to serialize Qwen locator parameter: missing prompt',
    );
  }

  const promptTag = `<prompt>${value.prompt}</prompt>`;
  if (!locateResultKey) {
    return promptTag;
  }

  const coordinate = (value as Record<string, unknown>)[locateResultKey];
  if (
    !Array.isArray(coordinate) ||
    coordinate.length !== 2 ||
    !coordinate.every((value) => typeof value === 'number')
  ) {
    throw new Error(
      'Qwen planning locator output requires a two-number coordinate',
    );
  }

  return `${promptTag}<coordinate>${JSON.stringify(coordinate)}</coordinate>`;
};

const getActionParameterSchema = (
  actionSpace: DeviceAction<any>[],
  actionName: string,
  parameterName: string,
) => {
  const action = actionSpace.find(({ name }) => name === actionName);
  if (!action?.paramSchema) {
    return undefined;
  }

  const schema = unwrapZodField(action.paramSchema) as {
    _def?: {
      typeName?: string;
      shape?: () => Record<string, unknown>;
    };
    shape?: Record<string, unknown>;
  };
  if (schema._def?.typeName !== 'ZodObject') {
    return undefined;
  }

  const shape =
    typeof schema._def.shape === 'function'
      ? schema._def.shape()
      : schema.shape;
  return shape?.[parameterName];
};

const schemaUsesPlainTextValue = (
  schema: unknown,
  content: string,
): boolean => {
  if (!schema) {
    return false;
  }

  const actualSchema = unwrapZodField(schema) as {
    _def?: {
      typeName?: string;
      options?: unknown[];
      value?: unknown;
    };
  };
  if (
    actualSchema._def?.typeName === 'ZodString' ||
    actualSchema._def?.typeName === 'ZodEnum'
  ) {
    return true;
  }
  if (actualSchema._def?.typeName === 'ZodLiteral') {
    return typeof actualSchema._def.value === 'string';
  }

  if (actualSchema._def?.typeName !== 'ZodUnion') {
    return false;
  }

  const options = actualSchema._def.options ?? [];
  const contentLooksLikeJsonContainer =
    content.startsWith('{') || content.startsWith('[');
  if (contentLooksLikeJsonContainer) {
    return !options.some((option) => {
      const optionTypeName = (
        unwrapZodField(option) as { _def?: { typeName?: string } }
      )._def?.typeName;
      return optionTypeName === 'ZodObject' || optionTypeName === 'ZodArray';
    });
  }

  return options.some((option) =>
    schemaUsesPlainTextValue(option, content),
  );
};

const parseParameterValue = (
  content: string,
  parameterSchema: unknown,
  jsonParser: JsonParser,
) => {
  if (
    isMidsceneLocatorField(parameterSchema) ||
    schemaUsesPlainTextValue(parameterSchema, content)
  ) {
    return content;
  }

  if (!parameterSchema) {
    return content.startsWith('{') || content.startsWith('[')
      ? parseJsonParameterValue(content, jsonParser)
      : content;
  }

  return parseJsonParameterValue(content, jsonParser);
};

const parseJsonParameterValue = (content: string, jsonParser: JsonParser) => {
  const wrapperKey = 'qwenParameterValue';
  const parsedWrapper = jsonParser(`{"${wrapperKey}":${content}}`, {
    source: 'planning-action-param',
  });
  if (
    !parsedWrapper ||
    typeof parsedWrapper !== 'object' ||
    Array.isArray(parsedWrapper) ||
    !(wrapperKey in parsedWrapper)
  ) {
    throw new Error('Failed to parse Qwen parameter JSON value');
  }

  return (parsedWrapper as Record<string, unknown>)[wrapperKey];
};

export const parseQwenToolCall = (content: string) => {
  const toolCallMatch = content.match(/<tool_call>([\s\S]*?)<\/tool_call>/i);
  if (!toolCallMatch) {
    return undefined;
  }

  const functionMatch = toolCallMatch[1].match(
    /<function=([^>]+)>([\s\S]*?)<\/function>/i,
  );
  if (!functionMatch) {
    return undefined;
  }

  return {
    functionName: functionMatch[1].trim(),
    parameters: Array.from(
      functionMatch[2].matchAll(
        /<parameter=([^>]+)>\s*([\s\S]*?)\s*<\/parameter>/gi,
      ),
      ([, name, rawValue]) => ({
        name: name.trim(),
        rawValue: rawValue.trim(),
      }),
    ),
  };
};

export const createQwenPlanningActionOutputParser =
  (jsonParser: JsonParser) =>
  (
    content: string,
    actionSpace: DeviceAction<any>[],
  ): PlanningAction | null => {
    const toolCall = parseQwenToolCall(content);
    if (!toolCall) {
      return null;
    }

    const param = Object.fromEntries(
      toolCall.parameters.map(({ name, rawValue }) => [
        name,
        parseParameterValue(
          rawValue,
          getActionParameterSchema(actionSpace, toolCall.functionName, name),
          jsonParser,
        ),
      ]),
    );

    return {
      type: toolCall.functionName,
      ...(Object.keys(param).length > 0 ? { param } : {}),
    };
  };

export const parseQwenRawLocateParameter = (
  value: unknown,
): ParsedPlanningLocateParameter => {
  if (typeof value !== 'string') {
    throw new Error('Qwen planning locator parameter must be a string');
  }

  const promptMatch = value.match(/<prompt>([\s\S]*?)<\/prompt>/i);
  const coordinateMatch = value.match(
    /<coordinate>\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]\s*<\/coordinate>/i,
  );
  if (!promptMatch && !coordinateMatch) {
    throw new Error(
      'Qwen planning locator parameter requires <prompt> or <coordinate>',
    );
  }

  return {
    ...(promptMatch ? { prompt: promptMatch[1] } : {}),
    ...(coordinateMatch
      ? {
          point: [Number(coordinateMatch[1]), Number(coordinateMatch[2])],
        }
      : {}),
  };
};

export { TOOL_CALL_TAG_NAME };
