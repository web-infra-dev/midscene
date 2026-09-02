import { findActionInActionSpaceOrThrow } from '@/common';
import type { DeviceAction } from '@/types';
import {
  buildActionDescription,
  buildLocateFieldDescription,
  serializePlanningActionParam,
} from '../model-adapter/default-planning-protocol';
import type {
  ParsedPlanningLocateParameter,
  PlanningActionOutputBuildInput,
  StandardPlanningProtocolFactory,
} from '../model-adapter/planning-protocol';
import type { JsonParser } from '../shared/json';

const qwenComputerUseToolName = 'computer_use';
const qwenToolCallTag = 'tool_call';

const getActionName = (description: unknown): string => {
  if (
    !description ||
    typeof description !== 'object' ||
    typeof (description as { type?: unknown }).type !== 'string'
  ) {
    throw new Error(
      `Qwen tool definition requires an action description with a string type, got ${JSON.stringify(description)}`,
    );
  }

  return (description as { type: string }).type;
};

const serializeQwenToolDefinition = (actionDescriptions: unknown[]) => {
  const actionSchemaDescription = [
    'Select exactly one Midscene action. Its parameter object must follow the matching schema below.',
    JSON.stringify(actionDescriptions, null, 2),
  ].join('\n');
  const toolDefinition = {
    type: 'function',
    function: {
      name: qwenComputerUseToolName,
      description:
        'Use one of the available Midscene actions to interact with the current UI.',
      parameters: {
        type: 'object',
        required: ['action', 'param'],
        properties: {
          action: {
            type: 'string',
            description: actionSchemaDescription,
            enum: actionDescriptions.map(getActionName),
          },
          param: {
            type: 'object',
            description:
              'Parameters for the selected Midscene action. Use exactly the fields from that action schema and do not invent aliases.',
          },
        },
      },
    },
  };

  return `<tools>\n${JSON.stringify(toolDefinition, null, 2)}\n</tools>`;
};

const buildQwenPlanningActionOutput = ({
  actionName,
  param,
  locateFields,
  locateResultKey,
}: PlanningActionOutputBuildInput) => {
  const serializedParam =
    locateFields && locateResultKey
      ? serializePlanningActionParam(param, locateFields, locateResultKey)
      : JSON.stringify(param, null, 2);

  return `<${qwenToolCallTag}>
<function=${qwenComputerUseToolName}>
<parameter=action>
${actionName}
</parameter>
<parameter=param>
${serializedParam}
</parameter>
</function>
</${qwenToolCallTag}>`;
};

const parseQwenToolCallParameters = (functionBody: string) => {
  const openingParameterTags = [...functionBody.matchAll(/<parameter\s*=/gi)];
  const parameterMatches = [
    ...functionBody.matchAll(
      /<parameter\s*=\s*([^>]+)>\s*([\s\S]*?)\s*<\/parameter\s*>/gi,
    ),
  ];

  if (openingParameterTags.length !== parameterMatches.length) {
    throw new Error('Malformed Qwen tool call parameter tags');
  }

  const parameters = new Map<string, string>();
  for (const match of parameterMatches) {
    const name = match[1].trim();
    if (parameters.has(name)) {
      throw new Error(`Duplicate Qwen tool call parameter: ${name}`);
    }
    parameters.set(name, match[2].trim());
  }

  const unsupportedParameters = [...parameters.keys()].filter(
    (name) => name !== 'action' && name !== 'param',
  );
  if (unsupportedParameters.length > 0) {
    throw new Error(
      `Unsupported Qwen tool call parameter(s): ${unsupportedParameters.join(', ')}`,
    );
  }

  return parameters;
};

const createQwenPlanningActionOutputParser =
  (jsonParser: JsonParser) =>
  (content: string, actionSpace: DeviceAction<any>[]) => {
    if (!content.trim()) {
      return null;
    }

    const openingToolCallTags = [
      ...content.matchAll(new RegExp(`<${qwenToolCallTag}>`, 'gi')),
    ];
    if (openingToolCallTags.length !== 1) {
      throw new Error(
        `Expected exactly one <${qwenToolCallTag}> block, got ${openingToolCallTags.length}`,
      );
    }

    const toolCallMatch = content.match(
      new RegExp(
        `<${qwenToolCallTag}>([\\s\\S]*?)<\\/${qwenToolCallTag}>`,
        'i',
      ),
    );
    if (!toolCallMatch) {
      throw new Error(`Malformed <${qwenToolCallTag}> block`);
    }

    const functionBody = toolCallMatch[1];
    const openingFunctionTags = [...functionBody.matchAll(/<function\s*=/gi)];
    const functionMatches = [
      ...functionBody.matchAll(
        /<function\s*=\s*([^>]+)>([\s\S]*?)<\/function\s*>/gi,
      ),
    ];
    if (
      openingFunctionTags.length !== 1 ||
      functionMatches.length !== openingFunctionTags.length
    ) {
      throw new Error(
        `Expected exactly one complete function call, got ${functionMatches.length}`,
      );
    }

    const functionName = functionMatches[0][1].trim();
    if (functionName !== qwenComputerUseToolName) {
      throw new Error(
        `Unsupported Qwen tool call function: ${functionName || '(empty)'}`,
      );
    }

    const parameters = parseQwenToolCallParameters(functionMatches[0][2]);
    const actionName = parameters.get('action')?.trim();
    if (!actionName) {
      throw new Error('Missing Qwen tool call parameter: action');
    }
    findActionInActionSpaceOrThrow(actionName, actionSpace);

    const rawParam = parameters.get('param');
    if (rawParam === undefined) {
      throw new Error('Missing Qwen tool call parameter: param');
    }

    let param: unknown;
    try {
      param = jsonParser(rawParam, {
        source: 'planning-action-param',
        preserveStringValueKeys:
          actionName.toLowerCase() === 'input' ? ['value'] : undefined,
        requireObject: true,
      });
    } catch (error) {
      throw new Error(`Failed to parse Qwen tool call param: ${error}`);
    }

    if (!param || typeof param !== 'object' || Array.isArray(param)) {
      throw new Error(
        `Qwen tool call param must be a JSON object, got ${JSON.stringify(param)}`,
      );
    }

    return {
      type: actionName,
      param,
    };
  };

export const createQwenComputerUsePlanningProtocol: StandardPlanningProtocolFactory =
  ({ jsonParser }) => ({
    actionSpaceProtocol: {
      title: 'Tools',
      format: 'jsonl',
      includeActionOutputExample: true,
      buildLocateFieldDescription,
      buildActionDescription,
      serializeActionDescriptions: serializeQwenToolDefinition,
    },
    actionOutputProtocol: {
      actionOutputTagNames: [qwenToolCallTag],
      actionOutputRules: [
        `- Call the ${qwenComputerUseToolName} function with exactly one <${qwenToolCallTag}> block.`,
        `- Nest exactly one <function=${qwenComputerUseToolName}> block inside <${qwenToolCallTag}> and do not output anything after </${qwenToolCallTag}>.`,
        "- Set <parameter=action> to the exact name of one Midscene action from the tool definition. 'complete' is NOT an action.",
        '- Set <parameter=param> to a JSON object using exactly the fields defined for that Midscene action. Do not invent alias fields.',
      ].join('\n'),
      actionOutputPlaceholder: [
        `<${qwenToolCallTag}>`,
        `<function=${qwenComputerUseToolName}>`,
        '<parameter=action>...</parameter>',
        '<parameter=param>...</parameter>',
        '</function>',
        `</${qwenToolCallTag}>`,
      ].join('\n'),
      buildActionOutput: buildQwenPlanningActionOutput,
      parseActionOutput: createQwenPlanningActionOutputParser(jsonParser),
      parseRawLocateParameter: (value) =>
        value as ParsedPlanningLocateParameter,
    },
  });
