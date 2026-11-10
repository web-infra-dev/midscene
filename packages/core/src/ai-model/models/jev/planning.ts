import { buildYamlFlowFromPlans } from '@/common';
import type { PlanFn } from '../../workflows/planning/types';
import { buildJevAction } from './planning-action';
import { prepareJevPlanningContext } from './planning-context';
import { decideJevAction } from './planning-decision';

export const jevPlan: PlanFn = async (instruction, options) => {
  if (options.actionSpace.length + 2 > 255) {
    throw new Error(
      'Jev planning supports at most 253 actions (255 choices including completion and delegation).',
    );
  }
  const history = options.conversationHistory;
  const context = await prepareJevPlanningContext(instruction, options);
  const decision = await decideJevAction(context, options);
  const { selected, choice, response } = decision;
  if (choice.kind === 'delegate') {
    return {
      actions: [],
      log: `Jev selected ${selected}`,
      rawResponse: response.content,
      usage: response.usage,
      shouldContinuePlanning: true,
      delegation: {
        reason: choice.action
          ? `The previous planner suggested ${choice.action.name}; delegating planning with this action as an advisory suggestion`
          : 'The previous planner delegated planning of the next step',
        suggestedAction: choice.action?.name,
      },
    };
  }
  const actions = buildJevAction(decision, context, instruction, options);
  const log = `Jev selected ${selected}`;
  const feedback = history.pendingFeedbackMessage;
  history.resetPendingFeedbackMessageIfExists();
  history.appendMessage({
    role: 'user',
    content: `Goal: ${instruction.text}\nExecution feedback: ${feedback}`,
  });
  history.appendMessage({
    role: 'assistant',
    content: JSON.stringify({ actions, log }),
  });
  history.appendHistoricalLog(
    `${log}: ${JSON.stringify(actions.map(({ type, param }) => ({ type, direction: param?.direction })))}`,
  );
  history.compressHistory(50, 20);
  return {
    actions,
    log,
    rawResponse: response.content,
    usage: response.usage,
    shouldContinuePlanning: choice.kind !== 'complete',
    ...(choice.kind === 'complete' ? { finalizeSuccess: true } : {}),
    yamlFlow: buildYamlFlowFromPlans(actions, options.actionSpace),
  };
};
