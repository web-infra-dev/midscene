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
  benchmark: 'Benchmark',

  // Feature Sections - CLIENTS
  clientsTitle: '平台',
  clientsHeading: `Web、PC、Mobile
等多端支持`,
  clientsDesc1: '用自然语言测试与自动化 Web、移动端和桌面应用',
  clientsDesc2: '一套 API、一套用例，在每个平台都一样',
  clientsDesc3:
    '触达选择器够不到的地方——无语义标注的元素、canvas、原生应用、跨域 iframe',

  // Feature Sections - Platforms
  platformWeb: 'Web',
  platformPC: 'PC',
  platformMobile: 'Mobile',
  platformAnyInterface: '任意界面',
  platformWebDesc:
    '把 Midscene 接入你的 Playwright 或 Puppeteer 测试，或用桥接模式驱动自己的 Chrome。',
  platformPCDesc: '用自然语言测试与自动化 macOS、Windows、Linux 上的桌面应用。',
  platformMobileDesc:
    '在真机与模拟器上测试与自动化 Android、iOS 和 HarmonyOS 应用。',
  platformAnyInterfaceDesc: '凡可截图皆可自动化——突破 DOM 与无障碍树的限制。',

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
  modelSeedDesc: '强大的视觉定位能力，元素定位可靠——Midscene 的稳妥默认选择。',
  modelQwenName: 'qwen3.7-plus',
  modelQwenDesc: '高质量视觉定位，性价比高，并提供可自托管的开源版本。',
  modelGeminiName: 'gemini-3.5-flash',
  modelGeminiDesc: '强大的多模态理解，元素定位表现出色。',
  modelMultiModelName: '多模型组合',
  modelMultiModelDesc: '让规划模型与视觉模型协同，提升任务完成率。',

  // Feature Sections - DEBUGGING
  debuggingTitle: '开发体验',
  debuggingHeading: `丰富的 API
和工具`,
  debuggingDesc1: '丰富的 API，用于编写测试与控制自动化流程',
  debuggingDesc2: '支持扩展自己的 UI 操作 Agent',
  debuggingDesc3: '大幅降低 UI 测试的维护成本',

  // Feature Cards
  featureRichAPIs: '丰富的 API',
  featureRichAPIsDesc:
    '既能自动规划完整流程，也提供 aiTap、aiAssert 等原子 API，用于精确测试。',
  featureSkillsMcp: 'Skills 与 MCP',
  featureSkillsMcpDesc:
    '开箱即用的 Skills 让 AI 编程 Agent 测试你的 UI；MCP Server 把 Midscene 暴露给其他 Agent。',
  featureReportsPlayground: '报告与 Playground',
  featureReportsPlaygroundDesc:
    '在可视化报告中逐步回放，并在 Playground 里快速试验。',
  featureFlexibleIntegration: '灵活集成',
  featureFlexibleIntegrationDesc:
    '用 YAML 编写流程，接入你的测试运行器，并自定义 Agent 执行策略。',
  featureBenchmarkDesc:
    '查看 AndroidWorld benchmark 分数、运行配置、报告文件和验收备注。',
  featureRichAPIsLink: '/api',
  featureSkillsMcpLink: '/skills',
  featureReportsPlaygroundLink: '/quick-experience',
  featureFlexibleIntegrationLink: '/automate-with-scripts-in-yaml',
  featureBenchmarkLink: '/android-world-benchmark-report',

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
