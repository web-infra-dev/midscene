import type { EN_US } from './enUS';

export const ZH_CN: Record<keyof typeof EN_US, string> = {
  // Banner - New Badge
  newBadge: '使用 Midscene Skills 控制任意平台',
  changelogLink: '了解更多',

  // Banner - Title
  heroTitle: 'Midscene.js',
  heroSubtitle:
    '开源、视觉驱动的 UI 测试——用自然语言编写测试用例，自动化任意平台。',

  // Banner - Stats
  githubStars: 'Github Stars',
  activeUsers: 'Github 趋势榜第2名',

  // Banner - CTA Buttons
  introduction: '使用文档',
  whatsNew: '案例展示',

  // Feature Sections - CLIENTS
  clientsTitle: '平台',
  clientsHeading: `Web、PC、Mobile
等多端支持`,
  clientsDesc1: '用自然语言测试与自动化 Web、移动端和桌面应用',
  clientsDesc2: '一套 API、一套用例，在每个平台都一样',
  clientsDesc3: '触达选择器够不到的地方——canvas、原生应用、跨域 iframe',

  // Feature Sections - Platforms
  platformWeb: 'Web',
  platformPC: 'PC',
  platformMobile: 'Mobile',
  platformAnyInterface: '任意界面',
  platformWebDesc:
    '与 Puppeteer 或 Playwright 集成，或使用桥接模式控制桌面浏览器。',
  platformPCDesc: '通过自然语言控制 macOS、Windows、Linux 上的桌面应用。',
  platformMobileDesc: '通过自然语言自动化控制 Android、iOS 和 HarmonyOS 设备。',
  platformAnyInterfaceDesc: '视觉建模支持任意界面的自动化，突破 DOM 限制。',

  // Feature Sections - MODELS
  modelsTitle: '模型策略',
  modelsHeading: `视觉模型
 多模型组合
 适配开源模型`,
  modelsDesc1: '视觉定位元素精准，无需维护选择器',
  modelsDesc2: '多模型协同提升完成率',
  modelsDesc3: '自带模型，含表现强劲的开源选项',

  // Model Cards
  modelSeedName: '豆包 Seed',
  modelSeedDesc:
    '豆包 Seed 视觉模型，针对视觉理解和 UI 元素识别进行优化，表现出色。',
  modelQwenName: 'Qwen3-VL',
  modelQwenDesc:
    'Qwen 视觉语言模型，支持高质量图像理解和 UI 元素识别，性价比高。',
  modelGeminiName: 'Gemini-3-Pro',
  modelGeminiDesc:
    'Gemini 先进的多模态模型，拥有强大的视觉能力和全面的 UI 自动化支持。',
  modelMultiModelName: '多模型组合',
  modelMultiModelDesc: '支持在规划、交互时选用不同模型，提升任务完成率',

  // Feature Sections - DEBUGGING
  debuggingTitle: '开发体验',
  debuggingHeading: `丰富的 API
和工具`,
  debuggingDesc1: '丰富的 API，用于编写测试与控制自动化流程',
  debuggingDesc2: '支持扩展自己的 UI 操作 Agent',
  debuggingDesc3: '大幅降低 UI 测试的维护成本',

  // Feature Cards
  featureRichAPIs: '丰富的 API',
  featureRichAPIsDesc: '同时支持智能执行流程与原子化精确控制。',
  featureSkillsMcp: 'Skills 与 MCP',
  featureSkillsMcpDesc:
    '为 AI 编程工具提供开箱即用的 Agent Skills，同时支持将设备操作暴露为 MCP Server。',
  featureReportsPlayground: '报告与 Playground',
  featureReportsPlaygroundDesc:
    '提供直观的可视化报告，帮助开发者回溯自动化流程',
  featureFlexibleIntegration: '灵活集成',
  featureFlexibleIntegrationDesc:
    '支持使用 Yaml 编写自动化流程，支持自定义 Agent 执行策略',
  featureRichAPIsLink: '/api',
  featureSkillsMcpLink: '/skills',
  featureReportsPlaygroundLink: '/quick-experience',
  featureFlexibleIntegrationLink: '/automate-with-scripts-in-yaml',

  // View All APIs
  apiMoreLink: '查看所有 API',
  apiMoreDesc: '探索完整的 API 文档以获取更多自动化能力。',

  // Who is Using
  whoIsUsingTitle: '谁在使用 Midscene',
  userVolcengine: '火山引擎',
  userDouyin: '抖音',
  userAlibaba: '阿里巴巴',
  userXiaomi: '小米',
  userIqiyi: '爱奇艺',
  userLark: '飞书',
  userSodaMusic: '汽水音乐',
  userBilibili: '哔哩哔哩',
  userBilibiliLogo: '/images/users/bilibili-zh-color.svg',
  userBilibiliLogoWidth: '120',
  userDoubao: '豆包',
  userDongchedi: '懂车帝',

  // Links
  multiModelStrategyLink: '/model-strategy#高阶特性多模型配合',
  platformWebLink: '/quick-experience.html',
  platformPCLink: '/quick-experience.html',
  platformMobileLink: '/android-introduction.html',
  platformAnyInterfaceLink: '/integrate-with-any-interface.html',
};
