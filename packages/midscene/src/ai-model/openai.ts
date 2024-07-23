import assert from 'assert';
import OpenAI, { ClientOptions } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import wrapper from 'langsmith/wrappers';
import { AIResponseFormat } from '@/types';

const envConfigKey = 'MIDSCENE_OPENAI_INIT_CONFIG_JSON';
const envModelKey = 'MIDSCENE_OPENAI_MODEL';
const envSmithDebug = 'MIDSCENE_LANGSMITH_DEBUG';

async function createOpenAI() {
  let extraConfig: ClientOptions = {};

  if (typeof process.env[envConfigKey] === 'string') {
    console.log('will use env config for openai');
    extraConfig = JSON.parse(process.env[envConfigKey]);
  } else if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API is missing');
  }

  const openai = new OpenAI(extraConfig);

  if (process.env[envSmithDebug]) {
    console.log('DEBUGGING MODE: using langsmith wrapper');
    const openai = wrapper.wrapOpenAI(new OpenAI());
    return openai;
  }

  return openai;
}

export async function call(
  messages: ChatCompletionMessageParam[],
  responseFormat?: AIResponseFormat,
): Promise<string> {
  const openai = await createOpenAI();
  const completion = await openai.chat.completions.create({
    model: process.env[envModelKey] || 'gpt-4o',
    messages,
    response_format: { type: responseFormat },
  });

  const { content } = completion.choices[0].message;
  assert(content, 'empty content');
  return content;
}

export async function callToGetJSONObject<T>(messages: ChatCompletionMessageParam[]): Promise<T> {
  const response = await call(messages, AIResponseFormat.JSON);
  assert(response, 'empty response');
  return JSON.parse(response);
}
