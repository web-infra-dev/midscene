import type { EN_US } from './enUS';

export const ZH_CN: Record<keyof typeof EN_US, string> = {
  // Homepage chapters
  chapterAgent: 'GUI Agent',
  chapterFramework: 'Midscene Test',
  agentChapterHeading: '为测试而生的 GUI Agent',
  agentChapterDesc:
    '从用户视角验证完整流程，是 E2E 测试的初衷。Midscene 通过视觉观察界面、执行操作并验证结果，可通过 API 接入已有工程，或通过 Skills 交给 AI 编程 Agent 使用。',
  frameworkChapterHeading: '全新设计的自然语言 E2E 测试框架',
  frameworkChapterDesc:
    'Midscene Test 是为自然语言 E2E 测试全新设计的框架。在 YAML 中用自然语言描述操作与断言，通过 TypeScript Node 扩展测试步骤，并由框架统一管理数据准备、清理、重试与执行报告。',
  exampleDesc:
    '按用户的操作意图写步骤，按用户看到的结果写预期。同一个测试意图，可以用 YAML 表达，也可以接入现有 JavaScript 测试。',
  agentIntegrationDesc:
    '可以直接使用 GUI Agent，无需采用 Midscene Test。通过 API、Playwright、Puppeteer 或 Skills 接入你的工作流。',
  executionEyebrow: '执行管理',
  executionHeading: '让用例持续、成批地运行',
  executionLifecycleTitle: '生命周期与清理',
  executionLifecycleDesc:
    '用 Before / After 钩子安排数据准备与资源清理，让每次执行的边界清晰。',
  executionRetryTitle: '失败重试',
  executionRetryDesc:
    '配置失败用例的重试次数；清理完成且无操作仍在运行后，再开始下一次尝试。',
  executionConcurrencyTitle: '隔离与并发',
  executionConcurrencyDesc:
    '用独立的 Project context 隔离运行环境，配置并发执行多个 Project。',
  executionReportTitle: '汇总测试结果',
  executionReportDesc:
    '在测试报告中查看 Project、用例、步骤与重试记录，追踪失败和未执行的原因。',

  // Banner - Title
  heroTitle: '像人一样看懂界面\n用自然语言完成 E2E 测试',
  heroSubtitle:
    'Midscene.js 提供基于视觉的 GUI Agent 和自然语言 E2E 测试框架，支持 Web、移动端和桌面应用。',

  openSource: '完全开源',

  // Banner - Stats
  githubStars: 'Github Stars',
  activeUsers: 'Github 趋势榜第2名',

  // Banner - CTA Buttons
  introduction: '使用文档',
  whatsNew: '案例展示',
  benchmark: 'Pass@1',
  completion: '完成率',

  // Natural-language test example
  exampleSetupOmitted: '省略模型配置、page 初始化与资源清理',
  exampleEyebrow: '编写测试',
  exampleHeading: '用自然语言描述步骤与预期',
  exampleCase: '筛选 100 美元以下的耳机',
  exampleAct: '搜索耳机，然后将结果筛选为价格低于 100 美元',
  exampleWait: '筛选后的搜索结果已显示',
  exampleAssert: '搜索结果中有商品，且每件商品价格都低于 100 美元',

  // Platforms
  platformGuide: '接入指南',
  clientsTitle: '跨端支持',
  clientsHeading: '一套 API，覆盖不同平台',
  platformWeb: 'Web',
  platformColumnName: '平台',
  platformColumnPackage: '包名',
  platformColumnDescription: '说明',
  platformWebAccess: 'Playwright · Puppeteer · 桌面\u00a0Chrome',
  platformDesktop: '桌面',
  platformDesktopAccess: 'macOS · Windows · Linux，支持远程\u00a0RDP',
  platformAndroidAccess: '真机 / 模拟器 · ADB',
  platformIosAccess: '真机 / 模拟器 · WebDriverAgent',
  platformHarmonyAccess: 'HarmonyOS\u00a0NEXT · HDC',
  platformCustom: '自定义界面',
  platformCustomAccess: '提供截图与操作能力，即可接入',
  platformCustomDoc: '扩展指南',
  platformBridgeDoc: 'Bridge 模式',

  // Feature Sections - MODELS
  modelsTitle: '视觉模型与策略',
  modelsHeading: '看懂界面，验证结果',

  // Model Cards
  modelVisionName: '截图定位与操作',
  modelVisionDesc:
    '直接根据截图定位元素并操作界面，无需维护选择器或额外标注，支持 Canvas 等自定义界面。',
  modelVisionMetric: '截图 → 定位 → 操作',
  modelAssertName: '验证用户看到的结果',
  modelAssertDesc:
    '用自然语言描述预期颜色、布局与状态，通过视觉断言检查界面实际呈现的效果。',
  modelAssertMetric: '颜色 · 布局 · 状态',
  modelSupportedLink: '查看模型配置',
  modelSupportedName: '支持多种模型',
  modelSupportedDesc:
    '支持豆包、DeepSeek、Qwen、GPT、Gemini、Kimi 等模型，按效果与预算选择。',
  modelCostName: '低模型调用成本',
  modelCostDesc:
    '以豆包 Seed 2.1 Turbo 为例：该次 AppControlBench 评测中，60 项任务通过 58 项，模型调用总费用为 $0.59。',
  modelCostExample: '评测案例 · AppControlBench',
  modelCostReport: '查看评测报告',
  modelCostMetric: '模型调用总费用',
  modelCostTasks: '/ 60 项任务',

  // Test framework
  frameworkHeading: 'AI 操作与业务操作\n写在同一个 YAML 里',
  frameworkDesc:
    '每个 YAML 步骤都调用一个 Node，可以是 AI 操作、平台操作或自定义业务操作。将这些 Node 组合成人和 AI 都能读写、审阅的测试用例。',
  frameworkAiTag: 'AI',
  frameworkNodeTag: '业务',
  frameworkLegendLabel: '步骤类型',
  frameworkAiTitle: 'AI 操作',
  frameworkAiDesc:
    'aiAct、aiAssert 等接口读取界面截图，按自然语言指令操作和断言。',
  frameworkNodeTitle: '业务操作',
  frameworkNodeDesc:
    '通过自定义 Node，用 TypeScript 准备测试数据、校验接口并清理资源。',
  frameworkStartLink: '创建测试项目',
  frameworkLink: '了解框架设计',
  frameworkCaseName: '已支付订单支持全额退款',
  frameworkCaseAct: '申请全额退款并提交',
  frameworkCaseAssert: '页面显示退款申请已提交',

  // Test project
  projectEyebrow: '测试工程',
  projectHeading: '定制属于自己的测试工程',
  projectDesc:
    'Midscene Test 提供扩展机制，用 TypeScript 将业务操作定义为 Node，注册后即可在 YAML 中调用。再生成 Markdown Node Spec，描述当前执行项目注册的全部 Node 及其输入参数，包括 AI、平台和自定义业务操作，让人和 AI 都能据此在用例中引用这些 Node。',
  projectNodesRole: '定义自己的操作',
  projectNodesDesc: '用 TypeScript 实现业务逻辑，并声明操作的输入参数。',
  projectSpecOperation: '已注册的 Node 名称',
  projectSpecInputs: '用途说明与输入参数',
  projectSpecUsage: '编写用例时的参考文档',
  projectCaseSetup: '引用自定义 Node',
  projectCaseAction: '传入所需参数',
  projectCaseCheck: '与 AI 操作、断言组合成用例',
  projectOutputsDesc:
    '生成描述测试工程能力的 Markdown 文档，再在 YAML 用例中引用已注册的 Node。',
  projectSpecRole: '由 midscene-test nodes 生成',
  projectSpecDesc: '列出所有已注册的 Node 及其输入 Schema。',
  projectCasesRole: '测试工程师 · AI Agent',
  projectCasesDesc: '根据 Spec 中的 Node 组合用例，无需阅读 TypeScript 代码。',
  projectLink: '开发自定义 Node',
  projectNodeDescription: '创建测试订单',
  projectCaseName: '全额退款',
  projectCaseAct: '为订单申请全额退款',
  projectCaseAssert: '退款申请已提交',

  // Testing toolkit
  debuggingTitle: 'AGENT 工具链',
  debuggingHeading: '接入、回放与调试',
  toolkitFrameworkTitle: 'AI Native E2E 测试框架',
  toolkitFrameworkDesc:
    '用 YAML 与自然语言写用例，用 TypeScript 扩展业务节点，组合 AI 操作与业务逻辑。',
  toolkitYaml: '描述用例与预期',
  toolkitTs: '扩展业务节点',
  toolkitEngineering: '脚手架与平台预设、生命周期、重试、隔离与并发执行。',
  toolkitNodeDocs: '自动生成 Node 说明书，让人和 AI Agent 共同维护用例。',
  toolkitFrameworkLink: '了解 Midscene Test',
  toolkitApiMetric: '操作 · 断言 · 数据提取',
  toolkitSkillsTitle: '让 AI 编程 Agent 操作界面',
  toolkitSkillsDesc:
    '通过 Midscene Skills，让 AI 编程 Agent 操作应用、验证界面，查看执行结果。',
  toolkitApiTitle: '丰富而灵活的 API',
  toolkitApiDesc:
    '覆盖自动规划、精细操作、视觉断言与数据提取，灵活接入已有测试工程。',
  toolkitPlan: '自动规划',
  toolkitAction: '精细操作',
  toolkitAssert: '视觉断言',
  toolkitQuery: '数据提取',
  toolkitIntegration:
    '接入 Playwright、Puppeteer 或 JavaScript 工程；AI 编程 Agent 也可通过 Skills 操作界面。',
  toolkitApiLink: '查看 API',
  toolkitSkillsLink: 'Skills',
  toolkitReportTitle: '回放执行，交互调试',
  toolkitReportDesc:
    '通过报告回看截图、AI 决策与执行结果，在 Playground 中试验和调整指令。',
  toolkitPlaygroundDesc:
    '结合运行日志定位问题，在 Playground 中试验和调整指令。',
  toolkitReportAlt: 'Midscene HTML 报告：步骤列表、执行时间线与界面操作回放',
  toolkitReportLink: '查看报告能力',
  toolkitPlaygroundLink: '体验 Playground',

  // Feature Sections - BENCHMARKS
  benchmarksTitle: '评测',
  benchmarksHeading: 'Benchmark 成绩',

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
  bottomCtaTitle: '用自然语言，写下你的第一个 E2E 测试',
  bottomCtaStart: '开始使用',
  bottomCtaExamples: '查看案例',
  licenseNotice: 'Midscene 是基于 MIT 许可证发布的免费开源软件。',
  copyrightNotice: '© 2024–至今 ByteDance Inc. 及其关联公司。',
};
