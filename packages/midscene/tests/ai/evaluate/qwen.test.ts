import {
  createWriteStream,
  promises as fsPromises,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { MIDSCENE_COOKIE, OPENAI_BASE_URL, getAIConfig } from '@/env';
import { compositeElementInfoImg, saveBase64Image } from '@midscene/shared/img';
import { describe, expect, it } from 'vitest';

// Function to convert image to base64
async function imageToBase64(imagePath: string): Promise<string> {
  const data = await fsPromises.readFile(imagePath);
  return data.toString('base64');
}

// Function to load element snapshot
function loadElementSnapshot(imagePath: string) {
  const snapshotPath = `${imagePath.split('/').slice(0, -1).join('/')}/element-snapshot.json`;
  try {
    const data = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    return {
      pageSize: {
        screenWidth: data[0].screenWidth,
        screenHeight: data[0].screenHeight,
      },
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error loading element snapshot: ${error.message}`);
    }
    return null;
  }
}

// Function to process queries
async function processQueries(queries: string[], imagePath: string) {
  // Convert the specified png file to base64
  const imageBase64 = await imageToBase64(imagePath);

  // Load page size info
  const snapshot = loadElementSnapshot(imagePath);
  if (!snapshot) {
    throw new Error('Failed to load element snapshot');
  }
  const { pageSize } = snapshot;

  const url = `${getAIConfig(OPENAI_BASE_URL)}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    Cookie: getAIConfig(MIDSCENE_COOKIE) || '',
  };

  const data: any = {
    model: 'Qwen/Qwen2-VL-7B-Instruct-AWQ',
    messages: [
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: `你是一位专业的UI测试工程师（2D）。
                        你将会接收到用户传递过来的两个参数：
                        1. 用户希望查找的目标元素描述
                        2. 页面尺寸
                        3. 页面截图信息
                        
                        根据用户描述，在页面截图中找到目标元素，并返回目标元素的坐标信息。
                        
                        用坐标 (x1,y1) 标记。其中，x1 表示点沿屏幕宽度的比率乘以 1000，y1 表示点沿屏幕高度的比率也乘以 1000

                        请以JSON格式返回结果：
                        {
                            "reason": "描述将要找到哪个元素，以及找到元素的原因(描述元素特征和位置（如：按钮、输入框、图标等），在其他元素的什么位置)",
                            "point": "x1,y1", // 元素中心点坐标
                        }`,
          },
        ],
      },
    ],
    temperature: 0.1,
    top_p: 0.1,
    max_tokens: 1024,
  };

  console.log('开始处理所有文本...');
  console.log('-'.repeat(50));

  // Prepare all requests
  const tasks = queries.map((query) => {
    const requestData = { ...data };
    requestData.messages = [
      data.messages[0],
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `
            用户希望查找的目标元素描述: ${query}
            页面尺寸: ${pageSize.screenWidth}x${pageSize.screenHeight}
            `,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imageBase64}`,
            },
          },
        ],
      },
    ];
    return { query, requestData };
  });

  // Send requests serially
  const results = [];
  //@ts-ignore
  for (const [index, { query, requestData }] of tasks.entries()) {
    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestData),
      });
      const elapsedTime = (Date.now() - startTime) / 1000;
      console.log(
        `Query ${index + 1}: ${query}, Status Code: ${response.status}, Elapsed Time: ${elapsedTime.toFixed(2)}s`,
      );

      const responseData = await response.json();
      const content = responseData.choices[0].message.content;
      const cleanContent = content
        .replace('```json\n', '')
        .replace('\n```', '');
      const jsonObj = parseNonStrictJSON(cleanContent);

      results.push({
        indexId: index + 1,
        query,
        status_code: response.status,
        point: jsonObj?.point,
        reason: jsonObj?.reason,
        response: content,
        elapsed_time: `${elapsedTime.toFixed(2)}s`,
      });
    } catch (error: unknown) {
      const err = error as { response?: { status: number }; message: string };
      console.error(
        `Error making request for query ${index + 1} '${query}': ${err.message}`,
      );
      results.push({
        index: index + 1,
        query,
        status_code: err.response?.status ?? null,
        error: err.message,
        elapsed_time: 'N/A',
      });
    }
  }

  // Draw boxes for each point and save images
  const elementsPositionInfo = results.map((result) => ({
    rect: {
      left: result.point?.split(',')[0] || 0,
      top: result.point?.split(',')[1] || 0,
      width: 4,
      height: 4,
    },
    indexId: result.indexId,
  }));

  const composeImage = await compositeElementInfoImg({
    inputImgBase64: imageBase64,
    elementsPositionInfo: elementsPositionInfo,
    size: {
      width: pageSize.screenWidth,
      height: pageSize.screenHeight,
    },
  });

  // Save composed image to same directory as input image
  const outputPath = path.join(
    path.dirname(imagePath),
    'output_with_markers.png',
  );
  await saveBase64Image({
    base64Data: composeImage,
    outputPath,
  });

  console.log('\nAll results:');
  console.log(JSON.stringify(results, null, 2));

  return results;
}

// Example usage
const onlineOrderText = {
  text: [
    '多肉大橘饮品的选择规格按钮',
    '选择规格，仔细检查',
    // '切换语言',
    // '青芒芒甘露的价格',
    // '青芒芒甘露的选择规格按钮',
    // '右上角购物车图标按钮',
    // '右下角客服按钮',
  ],
  image_path: path.resolve(__dirname, './test-data/online_order/input.png'),
};

const playPageText = {
  text: [
    // "搜索输入框",
    // "用户头像图标",
    // "点赞按钮(爱心形状，在头像下面，头像标签是 19，所以点赞不会是 19)",
    '评论按钮',
    '书签按钮',
    '分享按钮',
    // "转发按钮",
    // "播放按钮",
    // "右下角声音按钮（最下面一行倒数第二个）"
  ],
  image_path: path.resolve(
    __dirname,
    './test-data/aweme-play/output_without_text.png',
  ),
};

const loginPageText = {
  text: ['登录按钮', '注册按钮', '关闭弹窗按钮（X）', '验证码输入框'],
  image_path: path.resolve(__dirname, './test-data/aweme-login/input.png'),
};

describe(
  'automation - qwen',
  () => {
    it('basic run', async () => {
      // processQueries(playPageText.text, playPageText.image_path);
      await processQueries(onlineOrderText.text, onlineOrderText.image_path);
      //   await processQueries(loginPageText.text, loginPageText.image_path);
      expect(true).toBe(true);
    });
  },
  {
    timeout: 180 * 1000,
  },
);

function parseNonStrictJSON(source: string) {
  let jsonObj = null;
  try {
    jsonObj = JSON.parse(source);
  } catch (e) {
    try {
      jsonObj = new Function(`return ${source}`)();
    } catch (ee) {
      console.error('无法解析 JSON 字符串:', source);
    }
  }
  return jsonObj;
}
