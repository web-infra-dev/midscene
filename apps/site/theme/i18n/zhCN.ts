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

  // Platforms
  platformGuide: '接入指南',
  clientsTitle: '跨端支持',
  clientsHeading: '一套 API，覆盖不同平台',
  platformWeb: 'Web',
  platformWebAccess: 'Playwright · Puppeteer · 桌面 Chrome',
  platformDesktop: '桌面',
  platformDesktopAccess: 'macOS · Windows · Linux，支持远程 RDP',
  platformAndroidAccess: '真机 / 模拟器 · ADB',
  platformIosAccess: '真机 / 模拟器 · WebDriverAgent',
  platformHarmonyAccess: 'HarmonyOS NEXT · HDC',
  platformCustom: '自定义界面',
  platformCustomAccess: '提供截图与操作能力，即可接入',
  platformCustomDoc: '扩展指南',
  platformBridgeDoc: 'Bridge 模式',

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
    '以豆包 Seed 2.1 Turbo 为例：该次 AppControlBench 评测中，60 项任务通过 58 项，模型调用总费用为 $0.59。',
  modelCostExample: '评测案例 · AppControlBench',
  modelCostReport: '查看评测报告',
  modelCostMetric: '60 项任务的模型调用总费用',

  // Test framework
  frameworkHeading: '用 YAML 组织用例\n用 TypeScript 扩展',
  frameworkYamlTitle: '用自然语言组织测试用例',
  frameworkYamlDesc:
    '在 YAML 中组合界面操作、断言与业务节点，专注描述测试流程。',
  frameworkNodeTitle: '把业务能力封装为可复用节点',
  frameworkNodeDesc:
    '用 TypeScript 实现数据准备、接口调用与清理，供不同用例复用。',
  frameworkSpecTitle: '自动生成 Node 说明书',
  frameworkSpecDesc:
    '将已注册节点与参数定义导出为 Markdown，让开发者和 AI Agent 了解项目能力，共同编写与维护用例。',
  frameworkSpecOmitted: '其余 Schema 字段与节点说明省略。',
  frameworkSpecNote:
    '运行 pnpm exec midscene-test nodes 自动生成。这里展示 user.create 的说明片段，与 TypeScript 节点定义对应。',
  frameworkLink: '了解 Midscene Test',
  frameworkYamlTab: 'YAML 用例',
  frameworkNodeTab: 'TypeScript 扩展节点',
  frameworkCase: '搜索新建用户',
  frameworkAct: '搜索用户名 Alice',
  frameworkAssert: '搜索结果中显示用户 Alice',
  frameworkNodeDescription: '创建测试用户，并在用例结束后清理',
  frameworkYamlNote:
    '示例：准备用户数据，再通过界面搜索并验证。需先配置模型与 Web 运行环境，并替换示例网址。',
  frameworkNodeNote:
    'user.create 对应 YAML 中的同名步骤；userService 是你实现的业务接口，负责创建和删除测试用户。',

  // Testing toolkit
  debuggingTitle: '测试工具链',
  debuggingHeading: '完整的 AI Native 测试工具链',
  toolkitFrameworkTitle: 'AI Native 测试框架',
  toolkitFrameworkDesc:
    '用 YAML 与自然语言写用例，用 TypeScript 扩展业务节点，组合 AI 操作与业务逻辑。',
  toolkitYaml: '描述用例与预期',
  toolkitTs: '扩展业务节点',
  toolkitEngineering: '脚手架与平台预设、生命周期、重试、隔离与并发执行。',
  toolkitNodeDocs: '自动生成 Node 说明书，让人和 AI Agent 共同维护用例。',
  toolkitFrameworkLink: '了解 Midscene Test',
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
  toolkitReportTitle: '可回放、可观察的执行过程',
  toolkitReportDesc:
    '回放操作与截图，追踪 AI 和自定义步骤，在 Playground 中调试指令。',
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
  bottomCtaTitle: '面向 E2E 测试的 GUI Agent',
  licenseNotice: 'Midscene 是基于 MIT 许可证发布的免费开源软件。',
  copyrightNotice: '© 2024–至今 ByteDance Inc. 及其关联公司。',
};
