import type { PixelBbox, PlanningAIResponse, PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TUserPrompt } from '../../../common';
import { ConversationHistory } from '../../conversation-history';
import { AIResponseParseError } from '../../service-caller/index';
import type { CustomPlanningDefinition } from '../planning/custom-planning';
import { runCustomPlanning } from '../planning/custom-planning';
import type { PlanOptions } from '../planning/types';
import type {
  LocateFn,
  LocateModelResponse,
  LocateOptions,
  LocateRequestContext,
} from './types';

const debugInspect = getDebug('ai:inspect');

export interface PlanningActionLocatorDefinition {
  buildSystemPrompt(): string;
  getLocatedPixelBbox(actions: PlanningAction[]): PixelBbox | undefined;
}

async function buildPlanningActionLocatorPlanOptions(
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
    actionSpace: [],
    conversationHistory: new ConversationHistory(),
    includeLocateInPlanning: true,
    referenceImageMessages: locateRequest.referenceImageMessages,
  };
}

async function runPlanningActionLocatorPlan<TParsed>(
  elementDescription: TUserPrompt,
  planOptions: PlanOptions,
  definition: PlanningActionLocatorDefinition,
  planner: CustomPlanningDefinition<TParsed>,
): Promise<PlanningAIResponse> {
  return runCustomPlanning(elementDescription, planOptions, {
    ...planner,
    messages: {
      ...planner.messages,
      buildSystemPrompt: definition.buildSystemPrompt,
      buildUserInstruction: (instruction) => `Tap: ${instruction}`,
    },
  });
}

export function resolvePlanningActionLocator<TParsed>(
  definition: PlanningActionLocatorDefinition,
  planner: CustomPlanningDefinition<TParsed>,
): LocateFn {
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
        await buildPlanningActionLocatorPlanOptions(locateRequest);
      const planningResponse = await runPlanningActionLocatorPlan(
        elementDescription,
        locatePlanOptions,
        definition,
        planner,
      );

      rawResponse = planningResponse.rawResponse ?? '';
      rawChoiceMessage = planningResponse.rawChoiceMessage;
      usage = planningResponse.usage;
      reasoningContent = planningResponse.log;

      debugInspect('planning-action-locator rawResponse:', rawResponse);

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
        errorMessage || 'Failed to parse planning-action locator response',
      ];
      debugInspect('planning-action-locator parse error:', errors[0]);
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
