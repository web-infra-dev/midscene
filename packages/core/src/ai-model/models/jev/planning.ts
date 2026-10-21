import { buildYamlFlowFromPlans } from '@/common';
import type { AIUsageInfo, PlanningAction } from '@/types';
import { assert } from '@midscene/shared/utils';
import { callAI } from '../../service-caller';
import { systemOneResponseSchema } from '../../service-caller/system-one';
import { standardPlan } from '../../workflows/planning/standard-planning';
import type { PlanFn } from '../../workflows/planning/types';
import { prepareJevImage } from './image';

export const jevPlan: PlanFn = async (instruction, options) => {
  const history = options.conversationHistory;
  const delegate = async (reason: string) => {
    assert(
      options.getDefaultModelRuntime,
      'Default model runtime is required for Jev planning delegation',
    );
    const base = options.getDefaultModelRuntime();
    assert(
      base.config.modelFamily !== 'jev',
      'Jev cannot delegate planning to itself',
    );
    const runtime = {
      ...base,
      config: { ...base.config, intent: 'planning' as const },
      executionId: options.modelRuntime.executionId,
      onUsage: base.onUsage
        ? (usage: AIUsageInfo) =>
            base.onUsage?.({ ...usage, intent: 'planning' })
        : undefined,
      modelRouting: {
        requestedModel: options.modelRuntime.config.modelName,
        requestedSlot: options.modelRuntime.config.slot,
        task: 'planning' as const,
        reason,
      },
    };
    const planner =
      runtime.adapter.planning.kind === 'custom'
        ? runtime.adapter.planning.planFn
        : standardPlan;
    return planner(instruction, {
      ...options,
      modelRuntime: runtime,
      includeLocateInPlanning: false,
    });
  };
  const image = await prepareJevImage(options.context.screenshot.base64);
  const references = await Promise.all(
    instruction.referenceImages.map(async (reference, index) => ({
      key: `reference_${index}`,
      name: reference.name,
      image: await prepareJevImage(reference.url),
    })),
  );
  const state = {
    goal: instruction.text,
    context: options.actionContext,
    history: history.historicalLogsToText(),
    memory: history.memoriesToText(),
    feedback: history.pendingFeedbackMessage,
    references: references.map(({ key, name }) => ({
      image: `\`${key}\``,
      name,
    })),
    availableActions: options.actionSpace.map(({ name, description }) => ({
      name,
      description,
    })),
  };
  const criteria: Record<string, string> = {
    Complete:
      'The entire user goal is already satisfied, confirmed by the current screenshot and execution feedback. No text answer is requested.',
    Delegate:
      'The next step requires text input, generated output, an action or parameters not covered by the other choices. Also use for impossible tasks needing explanation.',
  };
  for (const action of options.actionSpace) {
    if (
      action.name === 'Tap' ||
      action.name === 'Scroll' ||
      action.name === 'Sleep'
    ) {
      criteria[action.name] =
        action.name === 'Sleep'
          ? 'Wait 800 ms for a transient loading state.'
          : (action.description ?? action.name);
    }
  }
  const response = await callAI([], options.modelRuntime, {
    abortSignal: options.abortSignal,
    systemOneRequest: {
      state,
      images: {
        screenshot: image.imageBase64,
        ...Object.fromEntries(
          references.map(({ key, image }) => [key, image.imageBase64]),
        ),
      },
      questions: {
        action: {
          type: 'choice',
          instructions:
            'Choose exactly the next step toward `goal` using the current `screenshot`, context, history and feedback. History records proposed actions; feedback and current screenshot establish what actually happened. Do not repeat completed steps. Reference images describe targets, not the current page.',
          criteria,
        },
        ...(criteria.Scroll
          ? {
              direction: {
                type: 'choice' as const,
                instructions:
                  'If scrolling is the next step toward `goal`, which direction reveals the desired off-screen content? Evaluate from the screenshot and history independently of the action question.',
                criteria: {
                  down: 'Reveal content below',
                  up: 'Reveal content above',
                  left: 'Reveal content to the left',
                  right: 'Reveal content to the right',
                },
              },
            }
          : {}),
      },
    },
  });
  const { answers } = systemOneResponseSchema.parse(
    JSON.parse(response.content),
  );
  assert(answers.action.type === 'choice', 'Invalid Jev planning action');
  const selected = answers.action.choice;
  if (selected === 'Delegate') {
    return delegate(
      'The next step requires parameters or output that Jev cannot generate',
    );
  }
  if (
    (selected === 'Tap' || selected === 'Scroll') &&
    options.locateModelRuntime?.config.modelFamily !== 'jev'
  ) {
    return delegate(
      'The configured Locate model requires a concrete target description from a general-purpose planner',
    );
  }
  // The normal Locate stage resolves this contextual target with its own runtime.
  // Do not embed planning coordinates or bypass the configured Locate model.
  const locate = {
    prompt: `Locate the single ${selected === 'Scroll' ? 'scrollable region to scroll' : 'element to tap'} for the NEXT step toward this goal. Use the current screenshot as authoritative. Previous proposals may have failed; use feedback. Task context: ${JSON.stringify(state)}`,
    images: instruction.referenceImages,
  };
  const actions: PlanningAction[] = (() => {
    if (selected === 'Complete') {
      return [];
    }
    if (selected === 'Sleep') {
      return [{ type: 'Sleep', param: { timeMs: 800 } }];
    }
    if (selected === 'Tap') {
      return [{ type: 'Tap', param: { locate } }];
    }
    assert(
      selected === 'Scroll' && answers.direction?.type === 'choice',
      'Invalid Jev scroll action',
    );
    return [
      {
        type: 'Scroll',
        param: {
          locate,
          direction: answers.direction.choice,
          scrollType: 'singleAction',
        },
      },
    ];
  })();
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
    shouldContinuePlanning: selected !== 'Complete',
    ...(selected === 'Complete' ? { finalizeSuccess: true } : {}),
    yamlFlow: buildYamlFlowFromPlans(actions, options.actionSpace),
  };
};
