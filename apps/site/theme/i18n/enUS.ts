export const EN_US = {
  // Banner - Title
  heroTitle: 'See interfaces like a human\nE2E testing in natural language',
  heroSubtitle:
    'Midscene.js helps developers bring AI to E2E testing with a vision-based GUI Agent and an extensible testing framework for web, mobile, and desktop apps.',

  // Banner - Stats
  githubStars: 'Github Stars',
  activeUsers: 'No.2 in Github trending',

  // Banner - CTA Buttons
  introduction: 'Documentation',
  whatsNew: 'Showcases',
  benchmark: 'Pass@1',
  completion: 'Completion',

  // Natural-language test example
  exampleYamlTitle: '@midscene/test + YAML test cases',
  exampleSetupOmitted: 'Model configuration, page setup, and cleanup omitted',
  exampleEyebrow: 'WRITE A TEST',
  exampleHeading: 'Describe steps and expectations in natural language',
  exampleCase: 'Find headphones under $100',
  exampleAct:
    'Search for headphones and filter the results to prices under $100',
  exampleWait: 'The filtered search results are visible',
  exampleAssert:
    'There are products in the search results, and each costs less than $100',

  // Feature Sections - CLIENTS
  clientsTitle: 'Platforms',
  clientsHeading: `Web, PC, Mobile,
and more`,
  clientsDesc1:
    'Test and automate with natural language across web, mobile, and desktop',
  clientsDesc2:
    'One unified API and test suite — the same way on every platform',
  clientsDesc3:
    'Reaches what selectors cannot — unlabeled elements, canvas, native apps, and cross-origin frames',

  // Feature Sections - Platforms
  platformWeb: 'Web',
  platformPC: 'PC',
  platformMobile: 'Mobile',
  platformAnyInterface: 'Any Interface',
  platformWebDesc:
    'Add Midscene to your Playwright or Puppeteer tests, or drive your own Chrome via Bridge Mode.',
  platformPCDesc:
    'Test and automate desktop apps on macOS, Windows, and Linux with natural language.',
  platformMobileDesc:
    'Test and automate Android, iOS, and HarmonyOS apps on real devices and simulators.',
  platformAnyInterfaceDesc:
    'Automate any interface you can screenshot — beyond DOM and accessibility limits.',

  // Feature Sections - MODELS
  modelsTitle: 'VISION MODELS & STRATEGY',
  modelsHeading: 'Vision-driven\nLow-cost testing',

  // Model Cards
  modelVisionName: 'Locate and act from screenshots',
  modelVisionDesc:
    'Locate elements and operate interfaces from screenshots, without maintaining selectors or annotations. Works with custom interfaces such as Canvas.',
  modelVisionMetric: 'Screenshot → Locate → Act',
  modelAssertName: 'Verify what users see',
  modelAssertDesc:
    'Describe expected colors, layouts, and states in natural language. Visual assertions check what the interface actually shows.',
  modelAssertMetric: 'Colors · Layouts · States',
  modelSupportedName: 'Multiple model options',
  modelSupportedDesc:
    'Choose from Doubao, DeepSeek, Qwen, GPT, Gemini, Kimi, and more to fit your tasks and budget.',
  modelCostName: 'Low model API cost',
  modelCostDesc:
    'Doubao Seed 2.1 Turbo: $0.59 total API cost for 60 AppControlBench tasks, with 58 passed.',
  modelCostMetric: 'Total model API cost for 60 tasks',

  // Feature Sections - DEBUGGING
  debuggingTitle: 'TESTING TOOLKIT',
  debuggingHeading: `Ready-to-use
UI testing toolkit`,
  debuggingDesc1: 'Practical APIs to script tests and control automation flows',
  debuggingDesc2: 'Supports extending your own UI action agents',
  debuggingDesc3: 'Lowers the maintenance cost of your UI tests',

  // Feature Sections - BENCHMARKS
  benchmarksTitle: 'EVALUATION',
  benchmarksHeading: 'Benchmarks',
  benchmarksDesc:
    "Explore Midscene's results on AndroidWorld, MobileWorld, and AppControlBench.",

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
  bottomCtaTitle: 'The GUI Agent for E2E Testing',
  licenseNotice:
    'Midscene is free and open source software released under the MIT license.',
  copyrightNotice: '© 2024-present ByteDance Inc. and its affiliates.',

  // Links
  platformWebLink: '/quick-start#chrome-extension',
  platformPCLink: '/quick-start#chrome-extension',
  platformMobileLink: '/platforms/android.html',
  platformAnyInterfaceLink: '/integrate-with-any-interface.html',
} as const;
