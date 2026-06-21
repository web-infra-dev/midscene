import type { DeviceAction } from '@/device';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import { z } from 'zod';
import { type TUserPrompt, getMidsceneLocationSchema } from '../../../common';
import { ConversationHistory } from '../../conversation-history';
import type { ResolvedCustomPlanningDefinition } from '../../model-adapter/custom-planning-types';
import type { PlanningTapLocatorDefinition } from '../../model-adapter/types';
import { AIResponseParseError } from '../../service-caller/index';
import { runCustomPlanning } from '../planning/custom-planning';
import type { PlanOptions } from '../planning/types';
import type {
  LocateFn,
  LocateModelResponse,
  LocateOptions,
  LocateRequestContext,
} from './types';

const debugInspect = getDebug('ai:inspect');

const planningActionLocatorActionSpace: DeviceAction[] = [
  {
    name: 'Tap',
    description: 'Tap the element',
    paramSchema: z.object({
      locate: getMidsceneLocationSchema(),
    }),
    call: async () => undefined,
  },
];

async function buildPlanningTapLocatorPlanOptions(
  locateRequest: LocateRequestContext,
): Promise<PlanOptions> {
  const { options, locateImage } = locateRequest;
  const { context } = options;

  return {
    ...options,
    context: {
      ...context,
      screenshot: {
        ...context.screenshot,
        base64: locateImage.imageBase64,
      } as typeof context.screenshot,
      shotSize: {
        width: locateImage.width,
        height: locateImage.height,
      },
    },
    actionSpace: planningActionLocatorActionSpace,
    conversationHistory: new ConversationHistory(),
    includeLocateInPlanning: true,
    referenceImageMessages: locateRequest.referenceImageMessages,
  };
}

export function resolvePlanningTapLocator<TParsed>(
  definition: PlanningTapLocatorDefinition,
  planner: ResolvedCustomPlanningDefinition<TParsed>,
): LocateFn {
  const locatorPlanner: ResolvedCustomPlanningDefinition<TParsed> = {
    ...planner,
    messages: {
      ...planner.messages,
      buildSystemPrompt: definition.buildSystemPrompt,
      buildUserInstruction: (instruction) => `Tap: ${instruction}`,
    },
  };

  return async (
    elementDescription: TUserPrompt,
    options: LocateOptions,
    locateRequest: LocateRequestContext,
  ): Promise<LocateModelResponse> => {
    assert(elementDescription, 'cannot find the target element description');

    let errors: string[] = [];
    let reasoningContent = '';
    let rawResponse = '';
    let rawChoiceMessage: unknown;
    let usage: LocateModelResponse['usage'];

    try {
      const locatePlanOptions =
        await buildPlanningTapLocatorPlanOptions(locateRequest);
      const planningResponse = await runCustomPlanning(
        elementDescription,
        locatePlanOptions,
        locatorPlanner,
      );

      rawResponse = planningResponse.rawResponse ?? '';
      rawChoiceMessage = planningResponse.rawChoiceMessage;
      usage = planningResponse.usage;
      reasoningContent = planningResponse.log;

      debugInspect('planning-tap-locator rawResponse:', rawResponse);

      const locatedPixelBbox = definition.getLocatedPixelBbox(
        planningResponse.actions ?? [],
      );

      if (!locatedPixelBbox) {
        throw new Error('No locatedPixelBbox found in planner response');
      }

      return {
        locatedPixelBbox,
        rawResponse,
        rawChoiceMessage,
        usage,
        reasoningContent,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (error instanceof AIResponseParseError) {
        rawResponse = error.rawResponse;
        rawChoiceMessage = error.rawChoiceMessage;
        usage = error.usage;
      }
      errors = [
        errorMessage || 'Failed to parse planning tap locator response',
      ];
      debugInspect('planning-tap-locator parse error:', errors[0]);
    }

    return {
      rawResponse,
      rawChoiceMessage,
      usage,
      reasoningContent,
      errors,
    };
  };
}
