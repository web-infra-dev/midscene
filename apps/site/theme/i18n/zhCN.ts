import type { EN_US } from './enUS';

export const ZH_CN: Record<keyof typeof EN_US, string> = {
  // Banner - Title
  heroTitle: 'Midscene.js\n像人一样使用软件\n用自然语言完成 E2E 测试',
  heroSubtitle: '基于视觉的 GUI Agent，支持 Web、移动端和桌面应用。',

  // Banner - Stats
  githubStars: 'Github Stars',
  activeUsers: 'Github 趋势榜第2名',

  // Banner - CTA Buttons
  introduction: '使用文档',
  whatsNew: '案例展示',
  benchmark: 'Pass@1',
  completion: '完成率',

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
  modelsHeading: '视觉驱动\n兼顾效果与成本',
  modelsDesc1: '模拟人类观察界面、执行操作与验证结果的方式',
  modelsDesc2: '选用高性价比视觉模型，降低高频 E2E 测试的调用成本',
  modelsDesc3: '支持多种模型，按需组合规划、定位与界面理解能力',

  // Model Cards
  modelSeedName: '豆包 Seed',
  modelSeedDesc: '强大的视觉定位能力，元素定位可靠——Midscene 的稳妥默认选择。',
  modelSupportedName: '支持多种模型',
  modelSupportedDesc: '适配 DeepSeek、Qwen、GPT、Gemini、Kimi 等模型。',
  modelCostName: '模型调用成本',
  modelCostDesc:
    '豆包 Seed 2.1 Turbo 在 AppControlBench 中的调用总费用为 $0.59，60 项任务通过 58 项。',
  modelCostMetric: '60 项任务的模型调用总费用',
  modelMultiModelName: '多模型组合',
  modelMultiModelDesc: '让规划模型与视觉模型协同，提升任务完成率。',

  // Feature Sections - DEBUGGING
  debuggingTitle: '测试工具箱',
  debuggingHeading: '开箱即用的\nUI 测试套件',
  debuggingDesc1: '丰富的 API，用于编写测试与控制自动化流程',
  debuggingDesc2: '支持扩展自己的 UI 操作 Agent',
  debuggingDesc3: '大幅降低 UI 测试的维护成本',

  // Feature Sections - BENCHMARKS
  benchmarksTitle: '评测',
  benchmarksHeading: 'Benchmark 成绩',
  benchmarksDesc:
    '查看 Midscene 在 AndroidWorld、MobileWorld 和 AppControlBench 上的成绩。',

  // Feature Cards
  featureRichAPIs: '丰富的 API',
  featureRichAPIsDesc:
    '既能自动规划完整流程，也提供 aiTap、aiAssert 等原子 API，用于精确测试。',
  featureSkills: 'Skills',
  featureSkillsDesc:
    '开箱即用的 Skills 让 AI 编程 Agent 通过 Midscene CLI 测试你的 UI。',
  featureReportsPlayground: '报告与 Playground',
  featureReportsPlaygroundDesc:
    '在可视化报告中逐步回放，并在 Playground 里快速试验。',
  featureFlexibleIntegration: '灵活集成',
  featureFlexibleIntegrationDesc:
    '使用 Midscene Test 编写 YAML 测试，并通过自定义 TypeScript Node 扩展。',
  featureRichAPIsLink: '/reference/',
  featureSkillsLink: '/skills',
  featureReportsPlaygroundLink: '/quick-start#chrome-extension',
  featureFlexibleIntegrationLink: '/midscene-test/overview',
  featureBenchmarkLink: '/android-world-benchmark-report',
  featureMobileWorldBenchmarkLink: '/mobile-world-benchmark-report',
  featureAppControlBenchLink: '/app-control-bench-report',

  // View All APIs
  apiMoreLink: '查看所有 API',
  apiMoreDesc: '探索完整的 API 文档以获取更多自动化能力。',

  // Who is Using
  whoIsUsingEyebrow: '用户',
  whoIsUsingTitle: '谁在使用 Midscene',
  userVolcengine: '火山引擎',
  userDouyin: '抖音',
  userAlibaba: '阿里巴巴',
  userCtrip: '携程',
  userXiaomi: '小米',
  userIqiyi: '爱奇艺',
  userLark: '飞书',
  userSodaMusic: '汽水音乐',
  userBilibili: '哔哩哔哩',
  userBilibiliLogo: '/images/users/bilibili-zh-color.svg',
  userBilibiliLogoWidth: '120',
  userDoubao: '豆包',
  userDongchedi: '懂车帝',

  // Bottom CTA and Footer
  bottomCtaTitle: '面向 E2E 测试的 GUI Agent',
  licenseNotice: 'Midscene 是基于 MIT 许可证发布的免费开源软件。',
  copyrightNotice: '© 2024–至今 ByteDance Inc. 及其关联公司。',

  // Links
  multiModelStrategyLink: '/model-strategy#高阶特性多模型配合',
  platformWebLink: '/quick-start#chrome-extension',
  platformPCLink: '/quick-start#chrome-extension',
  platformMobileLink: '/platforms/android.html',
  platformAnyInterfaceLink: '/integrate-with-any-interface.html',
};
