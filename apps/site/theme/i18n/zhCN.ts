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
  documentation: 'Github 项目链接',

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
  platformIOSDesc: '通过自然语言与 WebDriver 控制 iOS 设备',
  platformAndroidDesc: '通过自然语言与 adb 控制安卓设备',
  platformAnyInterfaceDesc: '视觉建模支持任意界面的自动化，突破 DOM 限制。',

  // Feature Sections - MODELS
  modelsTitle: '模型策略',
  modelsHeading: '视觉模型 · 多模型 · 开源选项',
  modelsDesc1: '视觉模型提升操作精准度',
  modelsDesc2: '多模型协同提升完成率',
  modelsDesc3: '有开源选项也靠谱',

  // Model Cards
  modelSeedName: '豆包 Seed',
  modelSeedDesc:
    '豆包 Seed 视觉模型，针对视觉理解和 UI 元素识别进行优化，表现出色。',
  modelQwenName: 'Qwen3-VL',
  modelQwenDesc:
    'Qwen 视觉语言模型，支持高质量图像理解和 UI 元素识别，性价比高。',
  modelGeminiName: 'Gemini-2.5-Pro',
  modelGeminiDesc:
    'Gemini 先进的多模态模型，拥有强大的视觉能力和全面的 UI 自动化支持。',
  modelUITARSName: '支持多模型组合（可选）',
  modelUITARSDesc: '可选：规划/洞察模型搭配视觉定位模型，提升完成率。',

  // Feature Sections - DEBUGGING
  debuggingTitle: '开发体验',
  debuggingHeading: '丰富的 API 和工具',
  debuggingDesc1: '大量实用 API，方便控制自动化流程和运行策略',
  debuggingDesc2: '支持扩展自己的 UI 操作 Agent',
  debuggingDesc3: '帮助开发者快速完成 UI Automation 任务上线',

  // Feature Cards
  featureRichAPIs: '丰富的 API',
  featureRichAPIsDesc: '同时支持智能执行流程与原子化精确控制。',
  featureMCPServer: 'MCP Server',
  featureMCPServerDesc: '将设备操作暴露为 MCP Server，并可与多种模型协作使用。',
  featureReportsPlayground: '报告与 Playground',
  featureReportsPlaygroundDesc: '优化调试体验，提供更直观的可视化与测试环境。',
  featureFlexibleIntegration: '灵活集成',
  featureFlexibleIntegrationDesc: '支持多种脚本格式、自定义模型及扩展特性。',

  // View All APIs
  apiMoreLink: '查看所有 API',
  apiMoreDesc: '探索完整的 API 文档以获取更多自动化能力。',
};
