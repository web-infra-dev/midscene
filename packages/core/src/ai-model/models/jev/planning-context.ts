import type { PlanFn, PlanOptions } from '../../workflows/planning/types';
import { prepareJevImage } from './image';

export async function prepareJevPlanningContext(
  instruction: Parameters<PlanFn>[0],
  options: PlanOptions,
) {
  const history = options.conversationHistory;
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
  return {
    state,
    images: {
      screenshot: image.imageBase64,
      ...Object.fromEntries(
        references.map(({ key, image }) => [key, image.imageBase64]),
      ),
    },
  };
}

export type JevPlanningContext = Awaited<
  ReturnType<typeof prepareJevPlanningContext>
>;
