export const EN_US = {
  // Banner - New Badge
  newBadge: 'Now supports the DeepSeek V4 vision model',
  changelogLink: 'Details',

  // Banner - Title
  heroTitle: 'Midscene.js\nthe GUI Agent\nfor E2E Testing',
  heroSubtitle: 'AI-powered vision. Cross-platform. Batteries included.',

  // Banner - Stats
  githubStars: 'Github Stars',
  activeUsers: 'No.2 in Github trending',

  // Banner - CTA Buttons
  introduction: 'Documentation',
  whatsNew: 'Showcases',
  benchmark: 'Pass@1',
  completion: 'Completion',

  // Feature Sections - CLIENTS
  clientsTitle: 'GUI Agent',
  clientsHeading: 'Act and verify\nlike a human',
  clientsDesc1:
    'Look at the screen, act on what you see, and check the visible result.',
  clientsDesc2: 'Describe tasks and expected outcomes in natural language.',
  clientsDesc3:
    'One set of Agent APIs across web, mobile, desktop, and custom interfaces.',

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
    'Connect screenshot and action capabilities to automate your own interface.',

  // Feature Sections - DEBUGGING
  debuggingTitle: 'Testing Kit',
  debuggingHeading: 'Batteries included\nfor E2E testing',
  debuggingDesc1: 'Built-in observability to understand every run.',
  debuggingDesc2: 'Midscene Test: an E2E framework for people and AI Agents.',
  debuggingDesc3: 'Rich APIs that fit your existing testing stack.',

  // Feature Sections - BENCHMARKS
  benchmarksTitle: 'GUI Agent · Performance',
  benchmarksHeading: 'Execution results\nand model cost',
  benchmarksDesc:
    'Reported runs with model configurations and task traces. Follow each report for evaluation conditions and adjustments.',

  // Feature Cards
  featureBenchmarkLink: '/android-world-benchmark-report',
  featureMobileWorldBenchmarkLink: '/mobile-world-benchmark-report',
  featureAppControlBenchLink: '/app-control-bench-report',

  // Visual capabilities, evidence, and onboarding
  visualActionTitle: 'Act on what you see',
  visualActionDesc:
    'Locate controls by appearance and position, then click, type, and scroll — including icon-only buttons, canvas, and cross-origin frames.',
  visualActionExample:
    'Search for headphones, then filter the results to under $100',
  visualAssertTitle: 'Verify what users see',
  visualAssertDesc:
    'Judge the rendered result from screenshots: colors, selection highlights, layout, and visual feedback, on web and native apps.',
  visualAssertExample: 'The selected plan has a blue border and a checkmark',
  costTitle: 'Model cost · 60 tasks',
  costDetails: 'Doubao Seed 2.1 Turbo · 58/60 passed',
  modelNote:
    'Choose from supported models, including self-hosted options, or combine planning and vision models.',
  modelLinkLabel: 'Explore model strategy',
  observeTitle: 'Built-in observability',
  observeDesc:
    'Inspect screenshots, element locations, AI decisions, and results. Midscene Test records AI and business steps with inputs, outputs, timing, and status.',
  testTitle: 'Midscene Test · Beta',
  testDesc:
    'Express test intent in YAML and extend business operations in TypeScript. Lifecycle hooks, retries, and generated Node references help people and AI Agents maintain tests together.',
  integrateTitle: 'Fits your existing stack',
  integrateDesc:
    'Combine actions, assertions, and data extraction with your code, fixtures, and test runner through Playwright, Puppeteer, or the JavaScript SDK.',
  startTitle: 'Get started',
  startHeading: 'Choose your way in',
  startDesc:
    'Try an instruction, build a test project, or bring Midscene into the tools you already use.',
  startPlayground: 'Playground',
  startPlaygroundDesc:
    'Try actions, queries, and visual assertions on web, mobile, or desktop.',
  startTest: 'Midscene Test',
  startTestDesc:
    'Create a test project with platform presets and example YAML cases.',
  startSDK: 'SDK integration',
  startSDKDesc:
    'Add visual actions and assertions to your existing Playwright tests.',
  startSkills: 'Skills',
  startSkillsDesc:
    'Let an AI coding Agent operate and test interfaces through Midscene CLIs.',

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
  multiModelStrategyLink: '/model-strategy#advanced-combining-multiple-models',
  platformWebLink: '/integrate-with-playwright',
  platformPCLink: '/platforms/desktop',
  platformMobileLink: '/platforms/android.html',
  platformAnyInterfaceLink: '/integrate-with-any-interface.html',
} as const;
