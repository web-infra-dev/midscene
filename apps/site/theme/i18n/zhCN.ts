import type { EN_US } from './enUS';

export const ZH_CN: Record<keyof typeof EN_US, string> = {
  // Banner - New Badge
  newBadge: 'Midscene 1.0 即将到来 - 现在 Beta 阶段',

  // Banner - Title
  heroTitle: 'Midscene.js',
  heroSubtitle: '视觉驱动的 UI 自动化 SDK，适配全平台',

  // Banner - Stats
  githubStars: 'Github Stars',
  activeUsers: 'Github 趋势榜第2名',

  // Banner - CTA Buttons
  introduction: '快速开始',
  documentation: '文档',

  // Feature Sections - CLIENTS
  clientsTitle: '平台',
  clientsHeading: 'Web、iOS、Android 等多端支持',
  clientsDesc1: '用自然语言跨平台控制浏览器和移动应用',
  clientsDesc2: '统一的 API 设计，轻松实现跨平台自动化',

  // Feature Sections - Platforms
  platformWeb: 'Web',
  platformIOS: 'iOS',
  platformAndroid: 'Android',
  platformAnyInterface: '任意界面',
  platformWebDesc:
    '与 Puppeteer 或 Playwright 集成，或使用桥接模式控制桌面浏览器。',
  platformIOSDesc:
    '使用 Javascript SDK 配合 WebDriverAgent 控制本地 iOS 设备。',
  platformAndroidDesc: '使用 Javascript SDK 配合 adb 控制本地 Android 设备。',
  platformAnyInterfaceDesc: '视觉建模支持任意界面的自动化，突破 DOM 限制。',

  // Feature Sections - MODELS
  modelsTitle: '模型',
  modelsHeading: 'UI 自动化的 AI 模型',
  modelsDesc1: '支持豆包 Seed、Qwen3-VL、Gemini-2.5-Pro 和 UI-TARS',
  modelsDesc2: '推荐使用视觉语言模型，可靠且成本低',
  modelsDesc3: '兼容 OpenAI SDK 风格接口，快速集成主流模型服务',

  // Model Cards
  modelSeedName: '豆包 Seed',
  modelSeedDesc:
    '字节跳动视觉模型，针对视觉理解和 UI 元素识别进行优化，性能出色。',
  modelQwenName: 'Qwen3-VL',
  modelQwenDesc:
    '阿里云千问视觉语言模型，支持高质量图像理解和 UI 元素识别，性价比高。',
  modelGeminiName: 'Gemini-2.5-Pro',
  modelGeminiDesc:
    'Google 先进的多模态模型，拥有强大的视觉能力和全面的 UI 自动化支持。',
  modelUITARSName: 'UI-TARS',
  modelUITARSDesc:
    '专为 UI 自动化设计的视觉语言模型，提供精准的界面元素定位和操作能力。',

  // Feature Sections - DEBUGGING
  debuggingTitle: '开发体验',
  debuggingHeading: '开发者 API 和工具',
  debuggingDesc1: '丰富的 API - 支持智能自动化和细粒度原子控制。',
  debuggingDesc2: 'MCP Server - 将设备操作暴露为 MCP Server，与多种模型协作。',
  debuggingDesc3: '报告和 Playground - 通过更清晰的可视化和测试工具改进调试体验。',
  debuggingDesc4: '灵活集成 - 支持多种脚本格式、自定义模型和可扩展功能。',

  // API names
  apiAction: 'aiAction',
  apiTap: 'aiTap',
  apiQuery: 'aiQuery',
  apiAssert: 'aiAssert',
  apiPlayback: '回放报告',
  apiActionDesc: '使用自然语言指令自动规划并执行复杂的 UI 操作。',
  apiTapDesc: '使用自然语言描述点击或触摸 UI 元素。',
  apiQueryDesc: '使用自然语言查询从页面中提取结构化数据。',
  apiAssertDesc: '使用 AI 驱动的断言验证页面状态和条件。',
  apiPlaybackDesc: '可视化报告，用于理解、回放和调试测试执行过程。',
  apiMoreLink: '查看所有 API',
  apiMoreDesc: '探索完整的 API 文档，了解更多自动化功能。',
};
