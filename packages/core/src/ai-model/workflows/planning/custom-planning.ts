import { type TUserPrompt, userPromptToString } from '@/common';
import type { PlanningAIResponse, PlanningAction } from '@/types';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import {
  AIResponseParseError,
  callAIWithStringResponse,
} from '../../service-caller/index';
import type { PlanOptions } from './types';

export interface CustomPlanningInput {
  // Original prompt from aiAct. Multimodal images are extracted before planning
  // and passed through PlanOptions.referenceImageMessages.
  userInstruction: TUserPrompt;
  // Text-only instruction used for prompt construction.
  userInstructionText: string;
  options: PlanOptions;
}

export interface CustomPlanningDefinition<TParsed = unknown> {
  messages: CustomPlanningMessageConfig<TParsed>;
  parseResponse(rawResponse: string, input: CustomPlanningInput): TParsed;
  transformActions(
    parsed: TParsed,
    input: CustomPlanningInput,
  ): PlanningAction[];
  shouldContinuePlanning(parsed: TParsed, actions: PlanningAction[]): boolean;
  buildResponseLog(parsed: TParsed, rawResponse: string): string;
}

export interface CustomPlanning {
  plan(
    userInstruction: TUserPrompt,
    options: PlanOptions,
  ): Promise<PlanningAIResponse>;
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

function appendHighPriorityKnowledge(
  systemPrompt: string,
  actionContext?: string,
): string {
  return (
    systemPrompt +
    (actionContext
      ? `<high_priority_knowledge>${actionContext}</high_priority_knowledge>\n`
      : '')
  );
}

export function buildCustomPlanningMessages<TParsed>(
  input: CustomPlanningInput,
  config: CustomPlanningMessageConfig<TParsed>,
): ChatCompletionMessageParam[] {
  const { options, userInstructionText } = input;
  const { conversationHistory, context, actionContext } = options;
  const systemPrompt = appendHighPriorityKnowledge(
    config.buildSystemPrompt(),
    actionContext,
  );
  const userInstruction = config.buildUserInstruction
    ? config.buildUserInstruction(userInstructionText)
    : userInstructionText;

  conversationHistory.append({
    role: 'user',
    content: [
      {
        type: 'image_url',
        image_url: { url: context.screenshot.base64 },
      },
    ],
  });

  if (config.systemPromptPlacement === 'system-message') {
    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [{ type: 'text', text: userInstruction }],
      },
      ...(options.referenceImageMessages ?? []),
      ...conversationHistory.snapshot(config.historyImageLimit),
    ];
  }

  return [
    {
      role: 'user',
      content: `${systemPrompt}${userInstruction}`,
    },
    ...(options.referenceImageMessages ?? []),
    ...conversationHistory.snapshot(config.historyImageLimit),
  ];
}

export async function runCustomPlanning<TParsed>(
  userInstruction: TUserPrompt,
  options: PlanOptions,
  config: CustomPlanningDefinition<TParsed>,
): Promise<PlanningAIResponse> {
  const input: CustomPlanningInput = {
    userInstruction,
    userInstructionText: userPromptToString(userInstruction),
    options,
  };

  const messages = buildCustomPlanningMessages(input, config.messages);
  const { content, usage, rawChoiceMessage } = await callAIWithStringResponse(
    messages,
    options.modelRuntime,
    {
      abortSignal: options.abortSignal,
    },
  );

  let parsed: TParsed;
  let actions: PlanningAction[];
  let shouldContinuePlanning: boolean;

  try {
    parsed = config.parseResponse(content, input);
    actions = config.transformActions(parsed, input);
    shouldContinuePlanning = config.shouldContinuePlanning(parsed, actions);
  } catch (parseError) {
    const errorMessage = `Parse error: ${
      parseError instanceof Error ? parseError.message : String(parseError)
    }`;
    throw new AIResponseParseError(
      errorMessage,
      JSON.stringify(content, undefined, 2),
      usage,
      rawChoiceMessage,
    );
  }

  const assistantContent = config.messages.buildAssistantContent?.(
    parsed,
    content,
    input,
  );
  if (assistantContent) {
    options.conversationHistory.append({
      role: 'assistant',
      content: assistantContent,
    });
  }

  return {
    actions,
    log: config.buildResponseLog(parsed, content),
    usage,
    shouldContinuePlanning,
    rawResponse: JSON.stringify(content, undefined, 2),
    rawChoiceMessage,
  };
}

export function resolveCustomPlanning<TParsed>(
  config: CustomPlanningDefinition<TParsed>,
): CustomPlanning {
  return {
    plan: (userInstruction: TUserPrompt, options: PlanOptions) =>
      runCustomPlanning(userInstruction, options, config),
  };
}
