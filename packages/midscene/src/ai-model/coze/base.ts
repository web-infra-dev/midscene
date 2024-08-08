import assert from 'node:assert';
import fetch from 'node-fetch';

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
    console.log('CozeAiInspectElement reponse error', completion);
    throw new Error('Network response was not ok');
  }

  const aiResponse = await completion.json();
  if (!aiResponse?.messages[0]?.content) {
    console.log('aiResponse', aiResponse);
    throw new Error('aiResponse is undefined');
  }
  const parseContent = aiResponse?.messages[0]?.content;
  assert(parseContent, 'empty content');
  return JSON.parse(parseContent);
}