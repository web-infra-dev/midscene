import type { TUserPrompt } from '@/common';
import type { DeviceAction, PlanningAIResponse, UIContext } from '@/types';
import type { ChatCompletionUserMessageParam } from 'openai/resources/index';
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
  referenceImageMessages?: ChatCompletionUserMessageParam[];
  abortSignal?: AbortSignal;
  /**
   * Optional free-form prompt addendum owned by the project's custom-actions
   * module (e.g. domain routing rules for discovered business CLI actions).
   * Rendered verbatim in the planning prompt between Action Guidelines and
   * the supporting actions list. Midscene core does not author or parse this
   * string — it is entirely provided by the project registering the actions.
   */
  customActionsPromptHints?: string;
}

export type PlanFn = (
  userInstruction: TUserPrompt,
  options: PlanOptions,
) => Promise<PlanningAIResponse>;
