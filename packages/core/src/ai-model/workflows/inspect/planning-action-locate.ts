import type {
  PixelBbox,
  PlanningAIResponse,
  PlanningAction,
  Rect,
} from '@/types';
import { generateElementByRect } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import type { LocateResultElement } from '@midscene/shared/types';
import { assert } from '@midscene/shared/utils';
import type { TUserPrompt } from '../../../common';
import { ConversationHistory } from '../../conversation-history';
import { extraTextFromUserPrompt, promptsToChatParam } from '../../inspect';
import { AIResponseParseError } from '../../service-caller/index';
import type { CustomPlanningDefinition } from '../planning/custom-planning';
import { runCustomPlanning } from '../planning/custom-planning';
import type { PlanOptions } from '../planning/types';
import { pixelBboxToRect } from './locate-result-rect';
import { mapSearchAreaPixelBboxToOriginalPixelBbox } from './search-area-mapping';
import type { LocateFn, LocateOptions, LocateResult } from './types';

const debugInspect = getDebug('ai:inspect');

export interface PlanningActionLocatorDefinition {
  buildSystemPrompt(): string;
  getLocatedPixelBbox(actions: PlanningAction[]): PixelBbox | undefined;
}

async function buildPlanningActionLocatorPlanOptions(
  elementDescription: TUserPrompt,
  options: LocateOptions,
): Promise<PlanOptions> {
  const { context } = options;
  const locateImage = options.searchConfig?.image ?? {
    imageBase64: context.screenshot.base64,
    width: context.shotSize.width,
    height: context.shotSize.height,
  };

  const referenceImageMessages =
    typeof elementDescription === 'string'
      ? undefined
      : await promptsToChatParam({
          images: elementDescription.images,
          convertHttpImage2Base64: elementDescription.convertHttpImage2Base64,
        });

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
    referenceImageMessages,
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
  ): Promise<LocateResult> => {
    assert(elementDescription, 'cannot find the target element description');
    const elementDescriptionText = extraTextFromUserPrompt(elementDescription);

    let resRect: Rect | undefined;
    let matchedElement: LocateResultElement | undefined;
    let errors: string[] = [];
    let reasoningContent = '';
    let rawResponse = '';
    let rawChoiceMessage: unknown;
    let usage: LocateResult['usage'];

    try {
      const locatePlanOptions = await buildPlanningActionLocatorPlanOptions(
        elementDescription,
        options,
      );
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

      resRect = pixelBboxToRect(
        mapSearchAreaPixelBboxToOriginalPixelBbox(
          locatedPixelBbox,
          options.searchConfig?.mapping,
        ),
      );

      debugInspect('planning-action-locator resRect:', resRect);

      matchedElement = generateElementByRect(resRect, elementDescriptionText);
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
      rect: resRect,
      parseResult: {
        element: matchedElement,
        errors,
      },
      rawResponse,
      rawChoiceMessage,
      usage,
      reasoning_content: reasoningContent,
    };
  };
}
