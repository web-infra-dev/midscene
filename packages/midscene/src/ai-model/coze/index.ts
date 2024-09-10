import assert from 'node:assert';
import fs from 'node:fs';
import { MidsceneLogType, midsceneLog } from '@/utils';
import FormData from 'form-data';
import fetch from 'node-fetch';
import type { ChatCompletionUserMessageParam } from 'openai/resources';
import {
  type CozeRequestUnionType,
  type RequestOfCozeChatType,
  type RequestOfCreateBotType,
  type RequestOfGetBotListType,
  type RequestOfGetCozeChatResultType,
  type RequestOfGetCozeChatStatusType,
  type RequestOfPublishBotType,
  type RequestOfUpdateBotType,
  RequestType,
  type ResponseOfCozeChatType,
  type ResponseOfCreateBotType,
  type ResponseOfGetBotListType,
  type ResponseOfGetCozeChatResultType,
  type ResponseOfGetCozeChatStatusType,
  type ResponseOfPublishBotType,
  type ResponseOfUpdateBotType,
  type ResponseOfUploadFileToCozeType,
} from './type';

export const COZE_INSPECT_ELEMENT_BOT_ID =
  process.env.COZE_INSPECT_ELEMENT_BOT_ID || '';
export const COZE_AI_ACTION_BOT_ID = process.env.COZE_AI_ACTION_BOT_ID || '';
export const COZE_AI_ASSERT_BOT_ID = process.env.COZE_AI_ASSERT_BOT_ID || '';
export const COZE_EXTRACT_INFO_BOT_ID =
  process.env.COZE_EXTRACT_INFO_BOT_ID || '';

export const COZE_BOT_TOKEN = 'COZE_BOT_TOKEN';

export function useCozeModel(useModel?: 'coze' | 'openAI') {
  if (useModel && useModel !== 'coze') return false;
  return (
    process.env.COZE_BOT_TOKEN &&
    process.env.COZE_INSPECT_ELEMENT_BOT_ID &&
    process.env.COZE_AI_ACTION_BOT_ID &&
    process.env.COZE_AI_ASSERT_BOT_ID &&
    process.env.COZE_EXTRACT_INFO_BOT_ID
  );
}

const commonHeader = {
  Authorization: `Bearer ${process.env.COZE_BOT_TOKEN}`,
  'content-type': 'application/json',
};

export function setupCoze() {
  const { COZE_SPACE_ID, COZE_TOKEN, COZE_ENV } = process?.env || {};
  if (!COZE_SPACE_ID || !COZE_TOKEN || !COZE_ENV) {
    throw new Error('need coze environment variables');
  }

  // query coze bot list

  // if coze bot not exist create a new bot
  // if bot exist and has right version. we reuse old bot
  // if bot exist but version not equal to midscene need to update bot

  // get bot Id and return
}

const getCozeBaseUrl = () => {
  if (
    !process.env.COZE_HOST ||
    process.env.COZE_HOST.indexOf('https://') === -1
  ) {
    midsceneLog(MidsceneLogType.cozeHostNotSet);
  }

  return process.env.COZE_HOST || 'https://api.coze.com';
};

export async function callCozeAi<T>(options: {
  query: string;
  imgs: Array<string>;
  botId: string;
}): Promise<T> {
  const { query, imgs, botId } = options;
  const completion = await fetch('https://api.coze.com/open_api/v2/chat', {
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
    console.error('CozeAI error response', aiResponse.msg);
    throw new Error(`CozeAI error response ${aiResponse.msg}`);
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

const cozeReqFactory = (url: string, type: RequestType) => {
  if (!process.env.COZE_BOT_TOKEN) {
    midsceneLog(MidsceneLogType.cozeTokenNotSet);
  }

  if (type === RequestType.GET) {
    return async (data: CozeRequestUnionType) => {
      const fPath = `${getCozeBaseUrl()}${url}`;
      try {
        const urlQuery = new URLSearchParams(
          data as unknown as Record<string, string>,
        );
        const completion = await fetch(`${fPath}?${urlQuery.toString()}`, {
          method: RequestType.GET,
          headers: commonHeader,
        });
        return completion;
      } catch (e) {
        midsceneLog(MidsceneLogType.cozeRequestFailure, { error: e });
      }
    };
  }

  return async (data: CozeRequestUnionType) => {
    const fPath = `${getCozeBaseUrl()}${url}`;
    try {
      const completion = await fetch(fPath, {
        method: RequestType.POST,
        headers: commonHeader,
        body: data ? JSON.stringify(data) : '',
      });
      return completion;
    } catch (e) {
      midsceneLog(MidsceneLogType.cozeRequestFailure, { error: e });
    }
  };
};

// create coze bot
export async function createCozeBot(
  params: RequestOfCreateBotType,
): Promise<ResponseOfCreateBotType> {
  const reqFn = cozeReqFactory('/v1/bot/create', RequestType.POST);
  const completion = await reqFn(params);

  return completion?.json();
}

// update coze bot
export async function updateCozeBot(
  params: RequestOfUpdateBotType,
): Promise<ResponseOfUpdateBotType> {
  const reqFn = cozeReqFactory('/v1/bot/update', RequestType.POST);
  const completion = await reqFn(params);

  return completion?.json();
}

// get coze bot list of special space
export async function getCozeBotList(
  params: RequestOfGetBotListType,
): Promise<ResponseOfGetBotListType> {
  const reqFn = cozeReqFactory(
    '/v1/space/published_bots_list',
    RequestType.GET,
  );
  const completion = await reqFn(params);

  return completion?.json();
}

// publish coze bot as api
export async function publisCozeAsApi(
  params: RequestOfPublishBotType,
): Promise<ResponseOfPublishBotType> {
  const reqFn = cozeReqFactory('/v1/bot/publish', RequestType.POST);
  const completion = await reqFn(params);

  return completion?.json();
}

// start coze chat
export async function cozeChat(
  params: RequestOfCozeChatType,
): Promise<ResponseOfCozeChatType> {
  const reqFn = cozeReqFactory('/v3/chat', RequestType.POST);
  const completion = await reqFn(params);

  return completion?.json();
}

// get coze chat status
export async function getCozeChatStatus(
  params: RequestOfGetCozeChatStatusType,
): Promise<ResponseOfGetCozeChatStatusType> {
  const reqFn = cozeReqFactory('/v3/chat/retrieve', RequestType.GET);
  const completion = await reqFn(params);

  return completion?.json();
}

// get coze chat result
export async function getCozeChatResult(
  params: RequestOfGetCozeChatResultType,
): Promise<ResponseOfGetCozeChatResultType> {
  const reqFn = cozeReqFactory('/v3/chat/message/list', RequestType.GET);
  const completion = await reqFn(params);

  return completion?.json();
}

// upload image to coze
export async function uploadImageToCoze(
  filePath: string,
): Promise<ResponseOfUploadFileToCozeType> {
  const fileData = fs.createReadStream(filePath);
  const form = new FormData();
  form.append('file', fileData);

  const completion = await fetch(`${getCozeBaseUrl()}/v1/files/upload`, {
    method: RequestType.POST,
    headers: {
      Authorization: commonHeader.Authorization,
    },
    body: form,
  });

  return completion?.json();
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
