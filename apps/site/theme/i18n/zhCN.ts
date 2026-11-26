import type { EN_US } from './enUS';

export const ZH_CN: Record<keyof typeof EN_US, string> = {
  // Homepage chapters
  chapterAgent: 'GUI Agent',
  chapterFramework: 'Midscene Test',
  agentChapterHeading: '为视觉测试而生的 GUI Agent',
  agentChapterDesc:
    'E2E 测试要像用户一样使用界面，而不是依赖 DOM 和选择器。Midscene 只靠视觉观察界面、执行操作并验证结果，可通过 API 接入已有工程，或通过 Skills 交给 AI 编程 Agent 使用。',
  frameworkChapterHeading: '当用例只剩下意图，测试框架应该长什么样',
  frameworkChapterDesc:
    '当界面操作和验证交给视觉模型，测试用例里真正剩下的就只有意图。Midscene Test 重新定义 AI-native 的 E2E 测试框架：用 YAML 表达纯粹的测试意图，通过 TypeScript Node 沉淀可复用的确定性业务能力，并围绕视觉 Agent 统一管理生命周期、隔离并发与执行回放。',
  exampleDesc:
    '按用户的操作意图写步骤，按用户看到的结果写预期。同一个测试意图，可以用 YAML 表达，也可以接入现有 JavaScript 测试。',
  agentIntegrationDesc:
    '可以直接使用 GUI Agent，无需采用 Midscene Test。通过 API、Playwright、Puppeteer 或 Skills 接入你的工作流。',
  executionEyebrow: '执行管理',
  executionHeading: '测试框架能力',
  executionLifecycleHref: '/midscene-test/execution#项目生命周期',
  executionLifecycleTitle: '生命周期钩子与资源清理',
  executionLifecycleDesc:
    '通过 setup、fileSetup、beforeAll、beforeEach 及对应的清理钩子，分别在项目、文件和用例层级准备与清理资源。用例失败、超时或按下 Ctrl+C 后，清理流程仍会执行。',
  executionLifecycleLink: '项目生命周期',
  executionScopeProject: '项目',
  executionInterrupted: '超时或 Ctrl+C',
  executionCleanupRuns: '清理照常执行',
  executionRetryHref: '/midscene-test/execution#失败时如何执行',
  executionRetryTitle: '失败重试与超时',
  executionRetryDesc:
    '失败用例可以重试，每次尝试都会重新执行 beforeEach、步骤和 afterEach。可以设置步骤超时，用 continue-on-error 在步骤失败后继续执行，用 bail 提前停止。',
  executionRetryLink: '失败时如何执行',
  executionAttempt1: '第 1 次尝试',
  executionAttempt2: '第 2 次尝试',
  executionAttemptTimeout: 'aiAssert 超时（120 秒）',
  executionAttemptPassed: '全部步骤通过',
  executionRetryAfterCleanup: '清理完成后重试',
  executionConcurrencyHref: '/midscene-test/execution#并发与资源隔离',
  executionConcurrencyTitle: '并发与隔离',
  executionConcurrencyDesc:
    '通过 maxConcurrentFiles 并发运行多个 YAML 文件。fileSetup 为每个文件准备独立的页面、Agent 或设备，并发文件之间不共享状态。',
  executionConcurrencyLink: '并发与资源隔离',
  executionConcurrencyRunning: '运行中',
  executionConcurrencyEnv: '独立页面与 Agent',
  executionConcurrencyQueued: '排队中',
  executionProjectsHref: '/midscene-test/configuration',
  executionProjectsTitle: '多 Project 跨端编排',
  executionProjectsDesc:
    '一份配置管理 Web、Android、iOS 与桌面套件，支持 --project 与标签筛选。',
  executionCiHref: '/midscene-test/running#在-github-actions-中运行',
  executionCiTitle: 'CI 与 GitHub Actions 集成',
  executionCiDesc:
    '官方 midscene-action 支持 PR Summary、#runner-step=last-error 失败直达链接与实时 Badge。',
  executionAiOutputHref: '/midscene-test/running#输出与退出码',
  executionAiOutputTitle: 'AI 可读产物与模型诊断',
  executionAiOutputDesc:
    '输出 summary.json 与 result.md 供脚本和 Agent 消费，内置 model verify 预检与 Token 统计。',
  executionLifecycleShortDesc:
    '项目、文件与用例三级钩子，失败、超时或 Ctrl+C 时仍按逆序释放浏览器与设备资源。',
  executionRetryShortDesc:
    '失败用例清理后自动重试，支持步骤超时、continue-on-error 与 bail 提前终止。',
  executionConcurrencyShortDesc:
    '通过 maxConcurrentFiles 并发跑用例，每个文件独占页面、Agent 或设备，互不干扰。',
  executionReportHref: '/midscene-test/running#输出与退出码',
  executionReportTitle: '精确到步骤的报告',
  executionReportDesc:
    'HTML 报告记录每个步骤的截图、输入、输出、错误和 Agent 回放。通过 #runner-step=last-error 链接，可以从 CI 通知或 PR 评论直接打开最近一次失败的步骤；summary.json 和 result.md 则供脚本和 AI Agent 读取。',
  executionReportLink: '输出与报告',
  executionReportSkipped: '未执行',
  executionReportScreenshot: '截图',
  executionReportReplay: 'Agent 回放',
  executionReportError: '错误',
  executionReportMachine: '供脚本和 AI Agent 读取',

  // Report replay schematic
  reportReplayCase: '筛选 100 美元以下的耳机',
  reportReplayActShort: '搜索无线耳机',
  reportReplayWaitShort: '筛选结果已显示',
  reportReplayAssertShort: '商品价格均低于 100 美元',
  reportReplayPrompt: '在输入框输入“无线耳机”，然后点击“搜索”按钮',
  reportReplayQuery: '无线耳机',
  reportReplayIdle: '尚未搜索',
  reportReplayFiltered: '已匹配 1 件商品',
  reportReplayPageTitle: 'Midscene 商品页',
  reportReplayPlaceholder: '输入商品名称',
  reportReplaySearchBtn: '搜索',
  reportReplayItemName: '降噪耳机',
  reportReplayAddCart: '加入购物车',

  // Banner - Title
  heroTitle: '像用户一样使用界面\n视觉驱动的自然语言 E2E 测试',
  heroSubtitle: '面向 Web、移动端和桌面应用的 GUI Agent 与 E2E 测试框架。',

  openSource: '完全开源',

  // Banner - Stats
  githubStars: 'GitHub Stars',
  activeUsers: 'GitHub 趋势榜第 2 名',

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
  exampleWait: '页面已显示筛选后的搜索结果',
  exampleAssert: '搜索结果中有商品，且每件商品价格都低于 100 美元',

  // Platforms
  platformGuide: '接入指南',
  clientsTitle: '跨端支持',
  clientsHeading: '一套 API，覆盖不同平台',
  platformWeb: 'Web',
  platformDesktop: '桌面',
  platformsApiLabel: '同一套 API',
  platformsApiPrompt: '搜索耳机',
  visionStepObserve: '规划步骤',
  visionStepObserveDesc: '读取界面截图，规划下一步操作',
  visionStepAct: '定位并操作',
  visionStepActDesc: '在屏幕上定位目标并执行界面交互',
  visionStepVerify: '验证结果',
  visionStepVerifyDesc: '断言用户实际看到的内容',
  visionShowcaseLink: '查看实际案例',
  platformCustom: '自定义界面',
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
    '以豆包 Seed 2.1 Turbo 为例：在这次 AppControlBench 评测的 60 项任务中通过了 58 项，模型调用总费用为 $0.59。',
  modelCostExample: '评测案例 · AppControlBench',
  modelCostReport: '查看评测报告',
  modelCostMetric: '模型调用总费用',
  modelCostTasks: '/ 60 项任务',

  // Test framework
  frameworkHeading: '交互操作与业务操作\n写在同一个 YAML 里',
  frameworkDesc:
    '每个 YAML 步骤都调用一个 Node，可以是交互操作、平台操作或自定义业务操作。将这些 Node 组合成人和 AI 都能读写、审阅的测试用例。',
  frameworkAiTag: '交互',
  frameworkNodeTag: '业务',
  frameworkLegendLabel: '步骤类型',
  frameworkAiTitle: '交互操作',
  frameworkAiDesc:
    'aiAct、aiAssert 等接口读取界面截图，按自然语言指令操作和断言。',
  frameworkNodeTitle: '业务操作',
  frameworkNodeDesc:
    '在自定义 Node 中用 TypeScript 准备测试数据、校验接口并清理资源。',
  frameworkStartLink: '创建测试项目',
  frameworkLink: '了解框架设计',
  frameworkCaseName: '已支付订单支持全额退款',
  frameworkCaseAct: '申请全额退款并提交',
  frameworkCaseAssert: '页面显示退款申请已提交',

  // Test project
  projectEyebrow: '测试工程',
  projectHeading: '定制自己的测试工程',
  projectDesc:
    'Midscene Test 提供扩展机制：用 TypeScript 把业务操作定义为 Node，注册后即可在 YAML 中调用。框架还会生成 Markdown 格式的 Node Spec，列出当前测试工程注册的全部 Node（包括 AI 操作、平台操作和自定义业务操作）及其输入参数，人和 AI Agent 都可以据此在用例中引用这些 Node。',
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
  projectCasesDesc:
    '根据 Spec 中的 Node 组合用例，无需阅读 Node 的 TypeScript 实现。',
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
    '用 YAML 与自然语言写用例，用 TypeScript 编写业务 Node，把 AI 操作与业务逻辑组合在一起。',
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
    '覆盖自动规划、精细操作、视觉断言与数据提取，可以灵活接入已有的测试工程。',
  toolkitPlan: '自动规划',
  toolkitAction: '精细操作',
  toolkitAssert: '视觉断言',
  toolkitQuery: '数据提取',
  toolkitIntegration:
    '可以接入 Playwright、Puppeteer 或 JavaScript 工程；AI 编程 Agent 也可以通过 Skills 操作界面。',
  toolkitApiLink: '查看 API',
  toolkitSkillsLink: 'Skills',
  toolkitReportTitle: '回放执行，交互调试',
  toolkitReportDesc:
    '通过报告回看截图、AI 决策与执行结果，在 Playground 中试验和调整指令。',
  toolkitPlaygroundDesc:
    '对照运行日志定位问题，在 Playground 中试验并调整指令。',
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
  featureReportsPlaygroundLink: '/get-started?scene=playground&platform=web',
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
