import { findAllMidsceneLocatorField } from '@/common';
import type { DeviceAction } from '@/types';
import { assert } from '@midscene/shared/utils';
import { callSystemOneAI } from '../../service-caller';
import { systemOneResponseSchema } from '../../service-caller/system-one/schema';
import type { PlanOptions } from '../../workflows/planning/types';
import type { JevPlanningContext } from './planning-context';

type JevPlanningChoice =
  | { kind: 'complete' }
  | { kind: 'delegate'; action?: DeviceAction }
  | { kind: 'action'; action: DeviceAction };

export async function decideJevAction(
  context: JevPlanningContext,
  options: PlanOptions,
) {
  const criteria: Record<string, string> = {
    'control:complete':
      'The entire user goal is already satisfied, confirmed by the current screenshot and execution feedback. No text answer is requested.',
    'control:delegate':
      'The next step needs generated output, an explanation of why the task cannot be completed, or something not covered by the action choices. Delegate to the default model.',
  };
  const choices = new Map<string, JevPlanningChoice>([
    ['control:complete', { kind: 'complete' }],
    ['control:delegate', { kind: 'delegate' }],
  ]);
  for (const action of options.actionSpace) {
    const kind = action.supportedBySystemOne ? 'action' : 'delegate';
    const key = `${kind}:${action.name}`;
    assert(!choices.has(key), `Duplicate Jev planning choice: ${key}`);
    choices.set(key, { kind, action });
    criteria[key] = `${action.name}: ${action.description ?? action.name}. ${
      kind === 'action'
        ? 'Perform this action.'
        : 'Suggest this action and delegate the next planning step, including its parameters, to the default model.'
    }`;
  }
  assert(choices.size <= 255, 'Jev Choice supports at most 255 options');
  const locateInPlanning =
    options.includeLocateInPlanning &&
    options.actionSpace.some(
      (action) =>
        action.supportedBySystemOne &&
        action.paramSchema &&
        findAllMidsceneLocatorField(action.paramSchema).length === 1,
    );
  const response = await callSystemOneAI(
    {
      ...context,
      questions: {
        ...(locateInPlanning
          ? {
              target: {
                type: 'box' as const,
                instructions:
                  'Identify the single UI element to interact with in the NEXT step toward `goal`, using the current `screenshot`, context, history and feedback. Return its bounding box in `screenshot`. This is the target of the next direct action (such as Tap, DoubleClick, Hover or ClearInput), not the final goal of the entire task. Reference images describe targets, not the current page. If the next step needs no target or must be delegated, this box is unused.',
              },
            }
          : {}),
        action: {
          type: 'choice',
          instructions:
            'Choose exactly the next step toward `goal` using the current `screenshot`, context, history and feedback. History records proposed actions; feedback and current screenshot establish what actually happened. Do not repeat completed steps. Reference images describe targets, not the current page. A delegate choice means the named action is likely needed; it has not been executed. Choose control:complete only when no requested work or text answer remains.',
          criteria,
        },
      },
    },
    options.modelRuntime,
    { abortSignal: options.abortSignal },
  );
  const { answers } = systemOneResponseSchema.parse(
    JSON.parse(response.content),
  );
  assert(answers.action.type === 'choice', 'Invalid Jev planning action');
  const selected = answers.action.choice;
  const choice = choices.get(selected);
  assert(choice, `Unknown Jev planning choice: ${selected}`);
  return {
    selected,
    choice,
    response,
    target: locateInPlanning ? answers.target : undefined,
  };
}

export type JevActionDecision = Awaited<ReturnType<typeof decideJevAction>>;
