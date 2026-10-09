import type { EN_US } from './enUS';

export const ZH_CN: Record<keyof typeof EN_US, string> = {
  // Banner - Title
  heroTitle: '像人一样看懂界面\n用自然语言完成 E2E 测试',
  heroSubtitle:
    'Midscene.js 帮助开发者将 AI 引入 E2E 测试，提供基于视觉的 GUI Agent 与可扩展的测试框架，覆盖 Web、移动端和桌面应用。',

  // Banner - Stats
  githubStars: 'Github Stars',
  activeUsers: 'Github 趋势榜第2名',

  // Banner - CTA Buttons
  introduction: '使用文档',
  whatsNew: '案例展示',
  benchmark: 'Pass@1',
  completion: '完成率',

  // Natural-language test example
  exampleYamlTitle: '@midscene/test + yaml 格式的用例',
  exampleSetupOmitted: '省略模型配置、page 初始化与资源清理',
  exampleEyebrow: '编写测试',
  exampleHeading: '用自然语言描述步骤与预期',
  exampleCase: '筛选 100 美元以下的耳机',
  exampleAct: '搜索耳机，然后将结果筛选为价格低于 100 美元',
  exampleWait: '筛选后的搜索结果已显示',
  exampleAssert: '搜索结果中有商品，且每件商品价格都低于 100 美元',

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
  modelsTitle: '视觉模型与策略',
  modelsHeading: '视觉驱动\n低成本运行测试',

  // Model Cards
  modelVisionName: '截图定位与操作',
  modelVisionDesc:
    '直接根据截图定位元素并操作界面，无需维护选择器或额外标注，支持 Canvas 等自定义界面。',
  modelVisionMetric: '截图 → 定位 → 操作',
  modelAssertName: '验证用户看到的结果',
  modelAssertDesc:
    '用自然语言描述预期颜色、布局与状态，通过视觉断言检查界面实际呈现的效果。',
  modelAssertMetric: '颜色 · 布局 · 状态',
  modelSupportedName: '支持多种模型',
  modelSupportedDesc:
    '支持豆包、DeepSeek、Qwen、GPT、Gemini、Kimi 等模型，按效果与预算选择。',
  modelCostName: '低模型调用成本',
  modelCostDesc:
    '豆包 Seed 2.1 Turbo 在 AppControlBench 中的调用总费用为 $0.59，60 项任务通过 58 项。',
  modelCostMetric: '60 项任务的模型调用总费用',

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
  platformWebLink: '/quick-start#chrome-extension',
  platformPCLink: '/quick-start#chrome-extension',
  platformMobileLink: '/platforms/android.html',
  platformAnyInterfaceLink: '/integrate-with-any-interface.html',
};
