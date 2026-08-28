import type { InsightProtocolFactory } from '../../model-adapter/insight-protocol';
import { SEED_RESPONSE_PREFIX } from './constants';
import { parseDoubaoToolCall } from './tool-call-parser';
import { serializeDoubaoToolCall } from './tool-call-serializer';

const extractDataFunctionDefinition = {
  type: 'function',
  name: 'extract_data',
  parameters: {
    type: 'object',
    properties: {
      data: {
        type: 'string',
        description:
          'The extracted data encoded as JSON. Its value and schema must match DATA_DEMAND.',
      },
    },
    required: ['data'],
  },
};

const buildExtractDataToolCall = (serializedData: string) =>
  serializeDoubaoToolCall({
    functionName: 'extract_data',
    parameters: [
      {
        name: 'data',
        stringAttribute: 'true',
        content: serializedData,
      },
    ],
  });

const dataOutputRules = `## Function Definition

- You have access to the following functions:
${JSON.stringify(extractDataFunctionDefinition)}

The data parameter must contain valid JSON, including when the result is a string, number, boolean, array, or null.`;

export const createDoubaoInsightProtocol: InsightProtocolFactory = ({
  jsonParser,
}) => ({
  responsePrefix: SEED_RESPONSE_PREFIX,
  dataOutput: {
    tagNames: ['seed:tool_call'],
    rules: dataOutputRules,
    placeholder: buildExtractDataToolCall('{"StatementIsTruthy":true}'),
    buildExample: buildExtractDataToolCall,
    parse: <T>(content: string): T => {
      const toolCall = parseDoubaoToolCall(content);
      if (!toolCall || toolCall.functionName !== 'extract_data') {
        throw new Error('Missing required Seed extract_data tool call');
      }

      const dataParameter = toolCall.parameters.find(
        ({ name }) => name === 'data',
      );
      if (!dataParameter) {
        throw new Error('Missing required Seed parameter: data');
      }

      try {
        return jsonParser(dataParameter.rawValue, {
          source: 'generic-object',
        }) as T;
      } catch (error) {
        throw new Error(`Failed to parse Seed data parameter: ${error}`);
      }
    },
  },
});
