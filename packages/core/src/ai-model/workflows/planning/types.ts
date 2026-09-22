import type {
  AiActEffort,
  DeviceAction,
  PlanningAIResponse,
  UIContext,
} from '@/types';
import type { ModelRuntime } from '../../models';
import type { PreparedUserPrompt } from '../../shared/multimodal-prompt';
import type { ConversationHistory } from './conversation-history';

export interface PlanOptions {
  context: UIContext;
  actionSpace: DeviceAction<any>[];
  actionContext?: string;
  modelRuntime: ModelRuntime;
  conversationHistory: ConversationHistory;
  includeLocateInPlanning: boolean;
  imagesIncludeCount?: number;
  /** @deprecated Ignored. Standard planning always supports optional sub-goals. */
  effort?: AiActEffort;
  abortSignal?: AbortSignal;
}

export type PlanFn = (
  userInstruction: PreparedUserPrompt,
  options: PlanOptions,
) => Promise<PlanningAIResponse>;
