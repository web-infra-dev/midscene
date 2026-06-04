import type { DeviceAction, PlanningAIResponse, UIContext } from '@/types';
import type { ConversationHistory } from '../../conversation-history';
import type { ModelRuntime } from '../../models';

export interface PlanOptions {
  context: UIContext;
  actionSpace: DeviceAction<any>[];
  actionContext?: string;
  modelRuntime: ModelRuntime;
  conversationHistory: ConversationHistory;
  includeLocateInPlanning: boolean;
  imagesIncludeCount?: number;
  // Controls aiAct planning prompt shape and state updates, such as sub-goals.
  deepThink?: boolean;
  abortSignal?: AbortSignal;
}

export type PlanFn = (
  userInstruction: string,
  options: PlanOptions,
) => Promise<PlanningAIResponse>;
