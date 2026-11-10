import type OpenAI from 'openai';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import type { OpenAIProtocolCallOptions } from '../../types';

export type ResponsesCallOptions = OpenAIProtocolCallOptions & {
  responses: OpenAI.Responses;
  requestBodyParams: Omit<ResponseCreateParamsNonStreaming, 'stream'>;
};
