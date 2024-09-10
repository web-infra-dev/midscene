import path from 'node:path';
import {
  cozeChat,
  createCozeBot,
  getCozeBotList,
  getCozeChatStatus,
  publisCozeAsApi,
  updateCozeBot,
  uploadImageToCoze,
} from '@/ai-model/coze';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 20 * 1000,
});

// export COZE_SPACE_ID="xxxx"
// export COZE_TOKEN="xxxx"
// export COZE_HOST="https://api.coze.com"
describe('openai', () => {
  it('create coze bot', async () => {
    const result = await createCozeBot({
      space_id: process.env.COZE_SPACE_ID as string,
      name: 'MidSceneTestBot',
    });

    expect(result.code).toBe(0);
  });

  it('update coze bot', async () => {
    const createBotResult = await createCozeBot({
      space_id: process.env.COZE_SPACE_ID as string,
      name: 'MidSceneTestBot',
    });

    const result = await updateCozeBot({
      bot_id: createBotResult?.data.bot_id,
      name: 'MidSceneTestBot',
      description: 'description test',
    });

    expect(result.code).toBe(0);
  });

  it('get coze bot list', async () => {
    const result = await getCozeBotList({
      space_id: process.env.COZE_SPACE_ID as string,
    });

    expect(result.code).toBe(0);
  });

  it('publis coze bot as api', async () => {
    const createBotResult = await createCozeBot({
      space_id: process.env.COZE_SPACE_ID as string,
      name: 'MidSceneTestBot',
    });

    const result = await publisCozeAsApi({
      bot_id: createBotResult?.data?.bot_id,
      connector_ids: ['API'],
    });

    expect(result.code).toBe(0);
  });

  it('coze chat api', async () => {
    const createBotResult = await createCozeBot({
      space_id: process.env.COZE_SPACE_ID as string,
      name: 'MidSceneTestBot',
    });

    await publisCozeAsApi({
      bot_id: createBotResult?.data?.bot_id,
      connector_ids: ['API'],
    });

    // only can use bot_id in api when bot alreday published as api
    const result = await cozeChat({
      bot_id: createBotResult?.data?.bot_id,
      user_id: 'test_user',
      stream: false,
    });

    expect(result.code).toBe(0);
  });

  it('get coze chat status', async () => {
    const createBotResult = await createCozeBot({
      space_id: process.env.COZE_SPACE_ID as string,
      name: 'MidSceneTestBot',
    });

    await publisCozeAsApi({
      bot_id: createBotResult?.data?.bot_id,
      connector_ids: ['API'],
    });

    const chatResult = await cozeChat({
      bot_id: createBotResult?.data?.bot_id,
      user_id: '11',
      stream: false,
    });

    const result = await getCozeChatStatus({
      chat_id: chatResult?.data?.id,
      conversation_id: chatResult?.data?.conversation_id,
    });

    expect(result.code).toBe(0);
  });

  it('upload image to coze', async () => {
    const filePath = path.join(__dirname, './test.png');
    const result = await uploadImageToCoze(filePath);

    expect(result.code).toBe(0);
  });
});
