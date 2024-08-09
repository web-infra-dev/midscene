import assert from 'node:assert';
import fetch from 'node-fetch';
import type { ChatCompletionUserMessageParam } from 'openai/resources';

export const INSPECT_ELEMENT_BOT_ID = '7390985487806775304';
export const AI_ACTION_BOT_ID = '7400540491193958417';
export const AI_ASSERT_BOT_ID = '7400712103818264594';
export const EXTRACT_INFO_BOT_ID = '7400757951536840722';

export const COZE_BOT_TOKEN = 'COZE_BOT_TOKEN';

export function useCozeModel(useModel?: 'coze' | 'openAI') {
  if (useModel && useModel !== 'coze') return false;
  return Boolean(process.env[COZE_BOT_TOKEN]);
}

export async function callCozeAi<T>(options: {
  query: string;
  imgs: Array<string>;
  botId: string;
}): Promise<T> {
  const { query, imgs, botId } = options;
  const completion = await fetch('https://api.coze.com/open_api/v2/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env[COZE_BOT_TOKEN]}`,
      'Content-Type': 'application/json',
      Accept: '*/*',
      Host: 'api.coze.com',
      Connection: 'keep-alive',
    },
    body: JSON.stringify({
      conversation_id: '123',
      bot_id: botId,
      user: '29032201862555',
      query,
      meta_data: {
        img: imgs.map((imgPath) => {
          return {
            url: imgPath,
          };
        }),
      },
      stream: false,
    }),
  });
  if (!completion.ok) {
    console.error('CozeAI reponse error', completion);
    throw new Error('Network response was not ok');
  }

  const aiResponse = await completion.json();
  if (aiResponse.code !== 0) {
    console.error('error response', aiResponse);
    throw new Error('error response', aiResponse);
  }

  if (!aiResponse?.messages || !aiResponse?.messages[0]?.content) {
    console.error('aiResponse', aiResponse);
    throw new Error('aiResponse is undefined', aiResponse);
  }
  const parseContent = aiResponse?.messages[0]?.content;
  assert(parseContent, 'empty content');
  try {
    return JSON.parse(parseContent);
  } catch (err) {
    console.error("can't parse coze content", aiResponse, err);
    throw Error("can't parse coze content");
  }
}

export function transfromOpenAiArgsToCoze(msg: ChatCompletionUserMessageParam) {
  if (msg.role !== 'user') throw Error(`can't transfrom ${msg} to coze args`);
  // const query = '';
  // const imgs = msg.content
  if (typeof msg.content === 'string') {
    return {
      query: msg.content,
      imgs: [],
    };
  }

  return {
    query: msg.content.reduce((res, next) => {
      if (next.type === 'text') {
        res += `\n${next.text}`;
      }
      return res;
    }, ''),
    imgs: msg.content.reduce(
      (res, next) => {
        if (next.type === 'image_url') {
          res.push(next.image_url.url);
        }
        return res;
      },
      [] as Array<string>,
    ),
  };
}