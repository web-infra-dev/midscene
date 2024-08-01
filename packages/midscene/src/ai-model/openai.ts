import assert from 'assert';
import OpenAI, { ClientOptions } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { wrapOpenAI } from 'langsmith/wrappers';
import { AIResponseFormat } from '@/types';

const envConfigKey = 'MIDSCENE_OPENAI_INIT_CONFIG_JSON';
const envModelKey = 'MIDSCENE_MODEL_NAME';
const envSmithDebug = 'MIDSCENE_LANGSMITH_DEBUG';

let extraConfig: ClientOptions = {};
if (typeof process.env[envConfigKey] === 'string') {
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
<<<<<<< Updated upstream
    console.log('DEBUGGING MODE: langsmith wrapper enabled');
=======
    console.log('DEBUGGING MODE: using langsmith wrapper');
>>>>>>> Stashed changes
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

export async function callToGetJSONObject<T>(messages: ChatCompletionMessageParam[]): Promise<T> {
  const response = await call(messages, AIResponseFormat.JSON);
  assert(response, 'empty response');
  return JSON.parse(response);
}
