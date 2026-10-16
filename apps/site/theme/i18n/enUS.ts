export const EN_US = {
  // Homepage chapters
  chapterAgent: 'GUI AGENT',
  chapterFramework: 'MIDSCENE TEST',
  agentChapterHeading: 'A GUI Agent built for testing',
  agentChapterDesc:
    'Understand interfaces, perform test steps, and verify what users see. Integrate with your existing test stack through APIs, or let AI coding agents test your UI through Skills.',
  frameworkChapterHeading:
    'A new E2E testing framework designed for natural language',
  frameworkChapterDesc:
    'Midscene Test is designed from the ground up for natural-language E2E testing. Write actions and assertions in YAML, extend test steps with TypeScript Nodes, and manage setup, cleanup, retries, and execution reports within one framework.',
  exampleDesc:
    'Describe what a user wants to do and what they should see. Express the same intent in YAML or in your existing JavaScript tests.',
  agentIntegrationDesc:
    'Use the GUI Agent directly without adopting Midscene Test. Connect it to your workflow through APIs, Playwright, Puppeteer, or Skills.',
  executionEyebrow: 'TEST EXECUTION',
  executionHeading: 'Run and maintain a growing test suite',
  executionLifecycleTitle: 'Lifecycle and cleanup',
  executionLifecycleDesc:
    'Use Before / After hooks to prepare data and clean up resources around each run.',
  executionRetryTitle: 'Failure retries',
  executionRetryDesc:
    'Configure retry limits for failed cases. A new attempt starts after cleanup completes and no operations remain running.',
  executionConcurrencyTitle: 'Isolation and concurrency',
  executionConcurrencyDesc:
    'Isolate environments with separate Project contexts and configure concurrent Project execution.',
  executionReportTitle: 'Test results in context',
  executionReportDesc:
    'Inspect Projects, cases, steps, and retry attempts in the test report, including failures and reasons steps did not run.',

  // Banner - Title
  heroTitle: 'See interfaces like a human\nE2E testing in natural language',
  heroSubtitle:
    'Midscene.js provides a vision-based GUI Agent and a natural-language E2E testing framework for web, mobile, and desktop apps.',

  openSource: 'Fully open source',

  // Banner - Stats
  githubStars: 'Github Stars',
  activeUsers: 'No.2 in Github trending',

  // Banner - CTA Buttons
  introduction: 'Documentation',
  whatsNew: 'Showcases',
  benchmark: 'Pass@1',
  completion: 'Completion',

  // Natural-language test example
  exampleSetupOmitted: 'Model configuration, page setup, and cleanup omitted',
  exampleEyebrow: 'WRITE A TEST',
  exampleHeading: 'Describe steps and expectations in natural language',
  exampleCase: 'Find headphones under $100',
  exampleAct:
    'Search for headphones and filter the results to prices under $100',
  exampleWait: 'The filtered search results are visible',
  exampleAssert:
    'There are products in the search results, and each costs less than $100',

  // Platforms
  platformGuide: 'Get started',
  clientsTitle: 'PLATFORMS',
  clientsHeading: 'One API, across platforms',
  platformWeb: 'Web',
  platformColumnName: 'Platform',
  platformColumnPackage: 'Package',
  platformColumnDescription: 'Description',
  platformWebAccess: 'Playwright · Puppeteer · Desktop\u00a0Chrome',
  platformDesktop: 'Desktop',
  platformDesktopAccess: 'macOS · Windows · Linux, with remote\u00a0RDP',
  platformAndroidAccess: 'Devices / emulators · ADB',
  platformIosAccess: 'Devices / simulators · WebDriverAgent',
  platformHarmonyAccess: 'HarmonyOS\u00a0NEXT · HDC',
  platformCustom: 'Custom interfaces',
  platformCustomAccess: 'Connect through screenshots and actions',
  platformCustomDoc: 'Extension guide',
  platformBridgeDoc: 'Bridge Mode',

  // Feature Sections - MODELS
  modelsTitle: 'VISION MODELS & STRATEGY',
  modelsHeading: 'Understand interfaces, verify outcomes',

  // Model Cards
  modelVisionName: 'Locate and act from screenshots',
  modelVisionDesc:
    'Locate elements and operate interfaces from screenshots, without maintaining selectors or annotations. Works with custom interfaces such as Canvas.',
  modelVisionMetric: 'Screenshot → Locate → Act',
  modelAssertName: 'Verify what users see',
  modelAssertDesc:
    'Describe expected colors, layouts, and states in natural language. Visual assertions check what the interface actually shows.',
  modelAssertMetric: 'Colors · Layouts · States',
  modelSupportedLink: 'View model configuration',
  modelSupportedName: 'Multiple model options',
  modelSupportedDesc:
    'Choose from Doubao, DeepSeek, Qwen, GPT, Gemini, Kimi, and more to fit your tasks and budget.',
  modelCostName: 'Low model API cost',
  modelCostDesc:
    'In this AppControlBench run, Doubao Seed 2.1 Turbo passed 58 of 60 tasks at a total model API cost of $0.59.',
  modelCostExample: 'Benchmark example · AppControlBench',
  modelCostReport: 'View benchmark report',
  modelCostMetric: 'Total model API cost',
  modelCostTasks: '/ 60 tasks',

  // Test framework
  frameworkHeading: 'AI steps and Nodes\nin one YAML file',
  frameworkDesc:
    'Organize tests in YAML so people and AI agents can read, write, and review natural-language intent alongside code steps.',
  frameworkLegendLabel: 'Step types',
  frameworkAiTitle: 'AI steps',
  frameworkAiDesc:
    'aiAct and aiAssert read the screen and follow natural-language instructions.',
  frameworkNodeTitle: 'Deterministic Nodes',
  frameworkNodeDesc:
    'TypeScript code for test data, API checks, and cleanup. It runs the same way every time.',
  frameworkStartLink: 'Create a test project',
  frameworkLink: 'Explore the framework design',
  frameworkCaseName: 'A paid order supports a full refund',
  frameworkCaseAct: 'Apply for a full refund and submit',
  frameworkCaseAssert: 'The page shows that the refund was submitted',

  // Test project
  projectEyebrow: 'TEST PROJECT',
  projectHeading: 'Customize your test project',
  projectDesc:
    'Extend Midscene Test with TypeScript Nodes for your business operations. Register them to make them callable from YAML, then generate a Markdown Node Spec describing the available operations and their inputs. People and AI agents can use the Spec to reference these Nodes in test cases.',
  projectNodesRole: 'Define your operations',
  projectNodesDesc:
    'Implement business logic and declare its inputs in TypeScript.',
  projectSpecOperation: 'Registered Node names',
  projectSpecInputs: 'Descriptions and input parameters',
  projectSpecUsage: 'Reference for writing test cases',
  projectCaseSetup: 'Reference a custom Node',
  projectCaseAction: 'Supply its input parameters',
  projectCaseCheck: 'Combine it with AI actions and assertions',
  projectOutputsDesc:
    'Generate a Markdown description of the test project’s capabilities, then reference the registered Nodes in YAML cases.',
  projectSpecRole: 'Generated by midscene-test nodes',
  projectSpecDesc: 'Lists every registered Node and its input schema.',
  projectCasesRole: 'QA engineers · AI Agents',
  projectCasesDesc:
    'Compose cases from the Nodes in the spec, without reading the TypeScript.',
  projectLink: 'Develop custom Nodes',
  projectNodeDescription: 'Create a test order',
  projectCaseName: 'Full refund',
  projectCaseAct: 'Refund the order',
  projectCaseAssert: 'The refund is submitted',

  // Testing toolkit
  debuggingTitle: 'AGENT TOOLKIT',
  debuggingHeading: 'Integrate, replay, and debug',
  toolkitFrameworkTitle: 'An AI-native E2E testing framework',
  toolkitFrameworkDesc:
    'Write tests in YAML and natural language. Extend them with TypeScript Nodes to combine AI actions with business logic.',
  toolkitYaml: 'Test flows & expectations',
  toolkitTs: 'Custom business Nodes',
  toolkitEngineering:
    'Scaffolding, platform presets, lifecycle hooks, retries, isolation, and concurrency.',
  toolkitNodeDocs:
    'Generate Node references so people and AI agents can maintain tests together.',
  toolkitFrameworkLink: 'Explore Midscene Test',
  toolkitApiMetric: 'Actions · Assertions · Data extraction',
  toolkitSkillsTitle: 'Let AI coding agents operate your UI',
  toolkitSkillsDesc:
    'Give AI coding agents Midscene Skills to operate apps, verify interfaces, and inspect execution results.',
  toolkitApiTitle: 'Rich, flexible APIs',
  toolkitApiDesc:
    'Bring autonomous flows, precise actions, visual assertions, and data extraction into your existing test stack.',
  toolkitPlan: 'Autonomous flows',
  toolkitAction: 'Precise actions',
  toolkitAssert: 'Visual assertions',
  toolkitQuery: 'Data extraction',
  toolkitIntegration:
    'Integrate with Playwright, Puppeteer, or JavaScript. AI coding agents can also operate interfaces through Skills.',
  toolkitApiLink: 'Explore APIs',
  toolkitSkillsLink: 'Skills',
  toolkitReportTitle: 'Replay runs, debug interactively',
  toolkitReportDesc:
    'Review screenshots, AI decisions, and execution results in reports. Try and refine instructions in the Playground.',
  toolkitPlaygroundDesc:
    'Investigate failures with runtime logs. Try and refine instructions in the Playground.',
  toolkitReportAlt:
    'Midscene HTML report with an action list, execution timeline, and interface replay',
  toolkitReportLink: 'Explore reporting',
  toolkitPlaygroundLink: 'Try the Playground',

  // Feature Sections - BENCHMARKS
  benchmarksTitle: 'EVALUATION',
  benchmarksHeading: 'Benchmarks',

  // Feature Cards
  featureRichAPIs: 'Rich APIs',
  featureRichAPIsDesc:
    'Auto-planning for whole flows, plus atomic APIs like aiTap and aiAssert for precise tests.',
  featureSkills: 'Skills',
  featureSkillsDesc:
    'Drop-in Skills let AI coding agents test your UI through Midscene CLIs.',
  featureReportsPlayground: 'Reports & Playground',
  featureReportsPlaygroundDesc:
    'Replay every step in a visual report, and try ideas fast in the playground.',
  featureFlexibleIntegration: 'Flexible Integration',
  featureFlexibleIntegrationDesc:
    'Write tests in YAML with Midscene Test and extend them with custom TypeScript Nodes.',
  featureRichAPIsLink: '/reference/',
  featureSkillsLink: '/skills',
  featureReportsPlaygroundLink: '/quick-start#chrome-extension',
  featureFlexibleIntegrationLink: '/midscene-test/overview',
  featureBenchmarkLink: '/android-world-benchmark-report',
  featureMobileWorldBenchmarkLink: '/mobile-world-benchmark-report',
  featureAppControlBenchLink: '/app-control-bench-report',

  // View All APIs
  apiMoreLink: 'View All APIs',
  apiMoreDesc:
    'Explore the complete API documentation for more automation capabilities.',

  // Who is Using
  whoIsUsingEyebrow: 'USERS',
  whoIsUsingTitle: 'Who is using Midscene',
  userVolcengine: 'Volcengine',
  userDouyin: 'Douyin',
  userAlibaba: 'Alibaba',
  userCtrip: 'Ctrip',
  userXiaomi: 'Xiaomi',
  userIqiyi: 'iQIYI',
  userLark: 'Lark',
  userSodaMusic: 'Soda Music',
  userBilibili: 'Bilibili',
  userBilibiliLogo: '/images/users/bilibili-color.svg',
  userBilibiliLogoWidth: '90',
  userDoubao: 'Doubao',
  userDongchedi: 'Dongchedi',

  // Bottom CTA and Footer
  bottomCtaTitle: 'Write your first E2E test in natural language',
  bottomCtaStart: 'Get started',
  bottomCtaExamples: 'Explore examples',
  licenseNotice:
    'Midscene is free and open source software released under the MIT license.',
  copyrightNotice: '© 2024-present ByteDance Inc. and its affiliates.',
} as const;
