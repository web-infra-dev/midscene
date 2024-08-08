import type { BaseElement, UIContext } from '@/types';
import fetch from 'node-fetch';
import { multiDescription } from './prompt/element_inspector';
import { describeUserPage } from './prompt/util';

const INSPECT_ELEMENT_BOT_ID = '7390985487806775304';

export async function CozeAiInspectElement<
  ElementType extends BaseElement = BaseElement,
>(msg: {
  findElementDescription: string;
  context: UIContext<ElementType>;
  multi?: boolean;
}) {
  const { multi = false, findElementDescription, context } = msg;
  const { screenshotBase64 } = context;
  const { description, elementById } = await describeUserPage(context);
  const query = JSON.stringify({
    description: findElementDescription,
    multi: multiDescription(multi),
    elementDescription: description,
  });
  const parseResult = await fetch('https://api.coze.com/open_api/v2/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.COZE_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: '*/*',
      Host: 'api.coze.com',
      Connection: 'keep-alive',
    },
    body: JSON.stringify({
      conversation_id: '123',
      bot_id: INSPECT_ELEMENT_BOT_ID,
      user: '29032201862555',
      query,
      meta_data: {
        img: [
          {
            url: screenshotBase64,
          },
        ],
      },
      stream: false,
    }),
  })
    .then((response) => {
      if (!response.ok) {
        console.log('response', response);
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then((data) => {
      const parseContent = data?.messages[0]?.content;
      if (parseContent) {
        return JSON.parse(parseContent);
      }
      return data;
    })
    .catch((error) => {
      console.error('Fetch error:', error);
    });
  return {
    parseResult,
    elementById,
  };
}
