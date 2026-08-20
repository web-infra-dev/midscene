import type {
  PlanningActionOutputProtocol,
  StandardPlanningProtocolFactory,
} from '../../model-adapter/planning-protocol';
import type { JsonParser } from '../../shared/json';
import {
  createDoubaoPlanningActionOutputParser,
  parseDoubaoRawLocateParameter,
} from './action-output-parser';
import { buildDoubaoPlanningActionOutput } from './action-output-serializer';
import {
  buildDoubaoActionDescription,
  buildDoubaoLocateFieldDescription,
} from './action-space';
import { SEED_TOOL_CALL_TAG_NAME } from './constants';

const THINK_TOKEN = 'think_never_used_51bce0c785ca2f68081bfa7d91973934';

const responsePrefix = `<${THINK_TOKEN}> reasoning process </${THINK_TOKEN}>`;

const createDoubaoActionOutputProtocol = (
  jsonParser: JsonParser,
): PlanningActionOutputProtocol => {
  const parseActionOutput = createDoubaoPlanningActionOutputParser(jsonParser);

  return {
    actionOutputTagNames: [SEED_TOOL_CALL_TAG_NAME],
    actionOutputRules: [
      `- Output exactly one <${SEED_TOOL_CALL_TAG_NAME}> using a function from Function Definition.`,
      '- The function name inside <function> MUST exactly match the name of one function in Function Definition.',
      '- All required parameters must be explicitly provided.',
      '- Set string="true" when a parameter value is a string. Set string="false" when it is an integer, number, or boolean.',
      '- For complex parameter values such as arrays or objects, set string="false" and encode the value as JSON.',
      '- For locator parameters, set string="true" and always preserve the target description as <prompt>element description</prompt>. If the Function Definition also requires coordinates, append <point>x y</point>.',
    ].join('\n'),
    actionOutputPlaceholder: `<${SEED_TOOL_CALL_TAG_NAME}><function name="..."><parameter name="..." string="false|true">...</parameter></function></${SEED_TOOL_CALL_TAG_NAME}>`,
    buildActionOutput: buildDoubaoPlanningActionOutput,
    parseActionOutput,
    parseRawLocateParameter: parseDoubaoRawLocateParameter,
  };
};

export const createDoubaoPlanningProtocol: StandardPlanningProtocolFactory = ({
  jsonParser,
}) => {
  const actionOutputProtocol = createDoubaoActionOutputProtocol(jsonParser);

  return {
    responsePrefix,
    actionSpaceProtocol: {
      title: 'Function Definition',
      format: 'jsonl',
      includeActionOutputExample: false,
      buildLocateFieldDescription: buildDoubaoLocateFieldDescription,
      buildActionDescription: buildDoubaoActionDescription,
    },
    actionOutputProtocol,
  };
};
