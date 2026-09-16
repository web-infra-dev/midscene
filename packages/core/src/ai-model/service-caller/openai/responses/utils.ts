import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type {
  Response,
  ResponseInput,
  ResponseUsage,
} from 'openai/resources/responses/responses';
import type { OpenAIProtocolCallResult } from '../../types';

export function toResponsesInput(
  messages: ChatCompletionMessageParam[],
): ResponseInput {
  return messages.map((message) => {
    if (
      message.role !== 'system' &&
      message.role !== 'user' &&
      message.role !== 'assistant'
    ) {
      throw new Error(
        `Responses does not support ${message.role} messages in this caller`,
      );
    }
    return {
      role: message.role,
      content:
        typeof message.content === 'string'
          ? message.content
          : (message.content ?? []).map((part) => {
              if (part.type === 'text') {
                return { type: 'input_text' as const, text: part.text };
              }
              if (part.type === 'image_url') {
                return {
                  type: 'input_image' as const,
                  image_url: part.image_url.url,
                  detail: part.image_url.detail ?? 'auto',
                };
              }
              throw new Error(
                `Responses does not support ${part.type} input in this caller`,
              );
            }),
    };
  });
}

export function mapResponsesUsage(
  usage: ResponseUsage | undefined,
): OpenAI.CompletionUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
    prompt_tokens_details: usage.input_tokens_details,
    completion_tokens_details: usage.output_tokens_details,
  };
}

export function parseResponse(response: Response): OpenAIProtocolCallResult {
  if (response.status !== 'completed') {
    throw new Error(
      `Responses request ${response.status}: ${response.error?.message ?? response.incomplete_details?.reason ?? 'response did not complete'}`,
    );
  }
  const content = response.output
    .flatMap((item) =>
      item.type === 'message'
        ? item.content.flatMap((part) =>
            part.type === 'output_text' ? [part.text] : [],
          )
        : [],
    )
    .join('');
  const reasoningContent = response.output
    .flatMap((item) => {
      if (item.type !== 'reasoning') {
        return [];
      }
      return (item.content?.length ? item.content : item.summary).map(
        (part) => part.text,
      );
    })
    .join('');
  return {
    content,
    reasoningContent,
    rawChoiceMessage: response.output,
    rawUsage: mapResponsesUsage(response.usage),
    responseModelName: response.model,
  };
}
