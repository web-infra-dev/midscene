import type { DeviceAction, PlanningAIResponse, UIContext } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import type { ConversationHistory } from '../../conversation-history';

export interface PlanOptions {
  context: UIContext;
  actionSpace: DeviceAction<any>[];
  actionContext?: string;
  modelConfig: IModelConfig;
  conversationHistory: ConversationHistory;
  includeBbox: boolean;
  imagesIncludeCount?: number;
  // Controls aiAct planning prompt shape and state updates, such as sub-goals.
  planningModeDeepThink?: boolean;
  abortSignal?: AbortSignal;
}

export type PlanFn = (
  userInstruction: string,
  options: PlanOptions,
) => Promise<PlanningAIResponse>;
