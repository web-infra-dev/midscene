import type { EN_US } from './enUS';

export const ZH_CN: Record<keyof typeof EN_US, string> = {
  // Banner - New Badge
  newBadge: '全新支持 deepseek v4 视觉模型',
  changelogLink: '了解更多',

  // Banner - Title
  heroTitle: 'Midscene.js - 端到端测试\n的 GUI Agent',
  heroSubtitle: 'AI 视觉驱动。全平台覆盖。开箱即用。',

  // Banner - Stats
  githubStars: 'Github Stars',
  activeUsers: 'Github 趋势榜第2名',

  // Banner - CTA Buttons
  introduction: '使用文档',
  whatsNew: '案例展示',
  benchmark: 'Pass@1',
  completion: '完成率',

  // Feature Sections - CLIENTS
  clientsTitle: 'GUI Agent',
  clientsHeading: '像人一样\n操作和验证界面',
  clientsDesc1: '观察屏幕，根据看到的内容操作，再检查界面呈现的结果。',
  clientsDesc2: '用自然语言描述任务和预期结果。',
  clientsDesc3: '同一套 Agent API 覆盖 Web、移动端、桌面端和自定义界面。',

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
  platformAnyInterfaceDesc: '接入截图和操作能力，自动化你的自定义界面。',

  // Feature Sections - DEBUGGING
  debuggingTitle: 'Testing Kit',
  debuggingHeading: '开箱即用的\nE2E 测试能力',
  debuggingDesc1: '内置可观测性，了解每次运行的过程与结果。',
  debuggingDesc2: 'Midscene Test：面向人和 AI Agent 的 E2E 测试框架。',
  debuggingDesc3: '丰富的 API，融入现有测试体系。',

  // Feature Sections - BENCHMARKS
  benchmarksTitle: 'GUI Agent · 执行表现',
  benchmarksHeading: '执行效果\n与模型成本',
  benchmarksDesc:
    '查看各次评测的模型配置和任务记录，完整报告说明了评测条件与调整。',

  // Feature Cards
  featureBenchmarkLink: '/android-world-benchmark-report',
  featureMobileWorldBenchmarkLink: '/mobile-world-benchmark-report',
  featureAppControlBenchLink: '/app-control-bench-report',

  // Visual capabilities, evidence, and onboarding
  visualActionTitle: '根据看到的内容操作',
  visualActionDesc:
    '根据外观和位置找到控件，再点击、输入和滚动，覆盖纯图标按钮、Canvas 和跨域 iframe。',
  visualActionExample: '搜索耳机，然后将结果筛选为价格低于 100 美元',
  visualAssertTitle: '验证用户真正看到的效果',
  visualAssertDesc:
    '根据截图判断颜色、选中高亮、布局和视觉反馈，检查 Web 与原生应用实际呈现的结果。',
  visualAssertExample: '选中的套餐带有蓝色边框和勾选标记',
  costTitle: '模型费用 · 60 个任务',
  costDetails: 'Doubao Seed 2.1 Turbo · 58/60 通过',
  modelNote: '支持多种模型与自托管选项，也可以按需组合规划模型与视觉模型。',
  modelLinkLabel: '了解模型策略',
  observeTitle: '内置可观测性',
  observeDesc:
    '查看截图、元素定位、AI 决策与执行结果。Midscene Test 统一记录 AI 和业务步骤的输入、输出、耗时与状态。',
  testTitle: 'Midscene Test · Beta',
  testDesc:
    'YAML 表达测试意图，TypeScript 扩展业务操作。生命周期钩子、重试和自动生成的节点文档，支持人和 AI Agent 共同维护用例。',
  integrateTitle: '融入现有测试体系',
  integrateDesc:
    '通过 Playwright、Puppeteer 或 JavaScript SDK，将操作、断言和数据提取与已有代码、测试夹具和运行器组合。',
  startTitle: '开始使用',
  startHeading: '选择适合你的入口',
  startDesc:
    '先试验一条指令、创建测试项目，或将 Midscene 接入你正在使用的工具。',
  startPlayground: 'Playground',
  startPlaygroundDesc: '在 Web、移动端或桌面端试验操作、查询和视觉断言。',
  startTest: 'Midscene Test',
  startTestDesc: '创建包含平台预设和 YAML 示例用例的测试项目。',
  startSDK: 'SDK 集成',
  startSDKDesc: '将视觉操作和断言加入现有 Playwright 测试。',
  startSkills: 'Skills',
  startSkillsDesc: '让 AI 编程 Agent 通过 Midscene CLI 操作和测试界面。',

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
  platformWebLink: '/integrate-with-playwright',
  platformPCLink: '/platforms/desktop',
  platformMobileLink: '/platforms/android.html',
  platformAnyInterfaceLink: '/integrate-with-any-interface.html',
};
