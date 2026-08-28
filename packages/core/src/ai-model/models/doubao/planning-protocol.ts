import type { StandardPlanningProtocolFactory } from '../../model-adapter/planning-protocol';
import {
  createDoubaoPlanningActionOutputParser,
  parseDoubaoRawLocateParameter,
} from './action-output-parser';
import {
  buildDoubaoActionDescription,
  buildDoubaoLocateFieldDescription,
} from './action-space';
import { SEED_RESPONSE_PREFIX, SEED_TOOL_CALL_TAG_NAME } from './constants';
import {
  buildDoubaoPlanningActionOutput,
  serializeDoubaoToolCall,
} from './tool-call-serializer';

const actionOutputPlaceholder = serializeDoubaoToolCall({
  functionName: '...',
  parameters: [
    {
      name: '...',
      stringAttribute: 'false|true',
      content: '...',
    },
  ],
});

export const createDoubaoPlanningProtocol: StandardPlanningProtocolFactory = ({
  jsonParser,
}) => {
  const parseActionOutput = createDoubaoPlanningActionOutputParser(jsonParser);

  return {
    responsePrefix: SEED_RESPONSE_PREFIX,
    actionSpaceProtocol: {
      title: 'Function Definition',
      format: 'jsonl',
      includeActionOutputExample: false,
      buildLocateFieldDescription: buildDoubaoLocateFieldDescription,
      buildActionDescription: buildDoubaoActionDescription,
    },
    actionOutputProtocol: {
      actionOutputTagNames: [SEED_TOOL_CALL_TAG_NAME],
      actionOutputRules: [
        `- Output exactly one <${SEED_TOOL_CALL_TAG_NAME}> using a function from Function Definition.`,
        '- The function name inside <function> MUST exactly match the name of one function in Function Definition.',
        '- All required parameters must be explicitly provided.',
        '- Set string="true" when a parameter value is a string. Set string="false" when it is an integer, number, or boolean.',
        '- For complex parameter values such as arrays or objects, set string="false" and encode the value as JSON.',
        '- For locator parameters, set string="true" and always preserve the target description as <prompt>element description</prompt>. If the Function Definition also requires coordinates, append <point>x y</point>.',
      ].join('\n'),
      actionOutputPlaceholder,
      buildActionOutput: buildDoubaoPlanningActionOutput,
      parseActionOutput,
      parseRawLocateParameter: parseDoubaoRawLocateParameter,
    },
  };
};
