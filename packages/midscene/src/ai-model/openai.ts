import assert from 'node:assert';
import { AIResponseFormat } from '@/types';
import { wrapOpenAI } from 'langsmith/wrappers';
import OpenAI, { type ClientOptions } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';

const envConfigKey = 'MIDSCENE_OPENAI_INIT_CONFIG_JSON';
const envModelKey = 'MIDSCENE_MODEL_NAME';
const envSmithDebug = 'MIDSCENE_LANGSMITH_DEBUG';

let extraConfig: ClientOptions = {};
if (
  typeof process.env[envConfigKey] === 'string' &&
  process.env[envConfigKey]
) {
  console.log('config for openai loaded');
  extraConfig = JSON.parse(process.env[envConfigKey]);
}

let model = 'gpt-4o';
if (typeof process.env[envModelKey] === 'string') {
  console.log(`model: ${process.env[envModelKey]}`);
  model = process.env[envModelKey];
}

async function createOpenAI() {
  const openai = new OpenAI(extraConfig);

  if (process.env[envSmithDebug]) {
    console.log('DEBUGGING MODE: langsmith wrapper enabled');
    const openai = wrapOpenAI(new OpenAI());
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
    model,
    messages,
    response_format: { type: responseFormat },
  });

  const { content } = completion.choices[0].message;
  assert(content, 'empty content');
  return content;
}

export async function callToGetJSONObject<T>(
  messages: ChatCompletionMessageParam[],
): Promise<T> {
  const response = await call(messages, AIResponseFormat.JSON);
  assert(response, 'empty response');
  return JSON.parse(response);
}
