import type OpenAI from 'openai';
import type {
  Response,
  ResponseInput,
  ResponseInputImage,
  ResponseUsage,
} from 'openai/resources/responses/responses';
import type { ResolveImageDetail } from '../../../model-adapter/types';
import type { ModelCallMessages, OpenAIProtocolCallResult } from '../../types';

export function toResponsesInput(
  messages: ModelCallMessages,
  resolveImageDetail: ResolveImageDetail,
): ResponseInput {
  return messages.flatMap((entry): ResponseInput => {
    if ('type' in entry && entry.type === 'model-output') {
      if (entry.output.type !== 'responses') {
        throw new Error(
          'Cannot replay Chat Completions output in a Responses conversation',
        );
      }
      return entry.output.rawValue;
    }
    const message = 'role' in entry ? entry : entry.message;
    if (typeof message.content === 'string') {
      return [{ role: message.role, content: message.content }];
    }
    if (message.role === 'assistant') {
      return [
        {
          role: message.role,
          content: message.content.map((part) => part.text).join(''),
        },
      ];
    }
    return [
      {
        role: message.role,
        content: message.content.map((part) => {
          if (part.type === 'text') {
            return { type: 'input_text' as const, text: part.text };
          }
          return {
            type: 'input_image' as const,
            image_url: part.url,
            // The installed SDK does not yet type `original`.
            detail: resolveImageDetail({
              imageDetail: part.detail,
            }) as ResponseInputImage['detail'],
          };
        }),
      },
    ];
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
    rawAssistantOutput: { type: 'responses', rawValue: response.output },
    rawUsage: mapResponsesUsage(response.usage),
    responseModelName: response.model,
  };
}
