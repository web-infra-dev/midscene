import type {
  AiActEffort,
  DeviceAction,
  PlanningAIResponse,
  UIContext,
} from '@/types';
import type { ModelRuntime } from '../../models';
import type { PreparedUserPrompt } from '../../shared/multimodal-prompt';
import type { PlanningAblation } from './ablation';
import type { ConversationHistory } from './conversation-history';

export interface PlanOptions {
  context: UIContext;
  actionSpace: DeviceAction<any>[];
  actionContext?: string;
  modelRuntime: ModelRuntime;
  conversationHistory: ConversationHistory;
  includeLocateInPlanning: boolean;
  imagesIncludeCount?: number;
  // Controls aiAct planning prompt shape and state updates, such as sub-goals.
  effort: AiActEffort;
  // Immutable experiment settings captured at the aiAct boundary.
  ablation?: PlanningAblation;
  abortSignal?: AbortSignal;
}

export type PlanFn = (
  userInstruction: PreparedUserPrompt,
  options: PlanOptions,
) => Promise<PlanningAIResponse>;
