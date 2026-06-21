import type { TUserPrompt } from '@/common';
import type { PlanningAction } from '@/types';
import type {
  LocateResultAdapter,
  LocateResultCoordinates,
  ResolvedLocateResultCoordinates,
} from '../../shared/model-locate-result/types';
import type { PlanOptions } from './types';

export interface CustomPlanningInput {
  // Original prompt from aiAct. Multimodal images are extracted before planning
  // and passed through PlanOptions.referenceImageMessages.
  userInstruction: TUserPrompt;
  // Text-only instruction used for prompt construction.
  userInstructionText: string;
  options: PlanOptions;
  coordinateSystem?: ResolvedLocateResultCoordinates;
}

interface CustomPlanningLifecycle<TParsed = unknown> {
  messages: CustomPlanningMessageConfig<TParsed>;
  parseResponse(rawResponse: string, input: CustomPlanningInput): TParsed;
  transformActions(
    parsed: TParsed,
    input: CustomPlanningInput,
  ): PlanningAction[];
  shouldContinuePlanning(parsed: TParsed, actions: PlanningAction[]): boolean;
  buildResponseLog(parsed: TParsed, rawResponse: string): string;
}

export interface CustomPlanningDefinition<TParsed = unknown>
  extends CustomPlanningLifecycle<TParsed> {
  coordinates: LocateResultCoordinates;
}

export interface ResolvedCustomPlanningDefinition<TParsed = unknown>
  extends CustomPlanningLifecycle<TParsed> {
  coordinateSystem: ResolvedLocateResultCoordinates;
  coordinateNormalizer: LocateResultAdapter;
}

export interface CustomPlanningMessageConfig<TParsed = unknown> {
  systemPromptPlacement: 'system-message' | 'user-message';
  buildSystemPrompt(): string;
  historyImageLimit?: number;
  buildUserInstruction?: (userInstruction: string) => string;
  buildAssistantContent?: (
    parsed: TParsed,
    rawResponse: string,
    input: CustomPlanningInput,
  ) => string | undefined;
}
