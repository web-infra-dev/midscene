import type { PlanningAction } from '@/types';
import type {
  LocateResultCodec,
  LocateResultCoordinates,
  ResolvedLocateResultCoordinates,
} from '../shared/model-locate-result/types';
import type { PreparedUserPrompt } from '../shared/multimodal-prompt';
import type { PlanOptions } from '../workflows/planning/types';

export interface CustomPlanningInput {
  userInstruction: PreparedUserPrompt;
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
  coordinateNormalizer: LocateResultCodec;
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
