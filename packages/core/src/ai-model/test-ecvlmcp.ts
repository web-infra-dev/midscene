import { vlLocateMode, getAIConfigInBoolean, MIDSCENE_USE_ECVLMCP } from '@midscene/shared/env';

// 测试 ECVLMCP 配置
console.log('Testing ECVLMCP configuration...');

// 模拟设置环境变量
process.env.MIDSCENE_USE_ECVLMCP = '1';
process.env.MIDSCENE_ECVLMCP_ENDPOINT = 'http://localhost:3001/chat';

console.log('MIDSCENE_USE_ECVLMCP enabled:', getAIConfigInBoolean(MIDSCENE_USE_ECVLMCP));
console.log('vlLocateMode():', vlLocateMode());

export {};
