import type { EN_US } from './enUS';

export const ZH_CN: Record<keyof typeof EN_US, string> = {
  // Banner - New Badge
  newBadge: 'Midscene 1.0 beta 现已发布',

  // Banner - Title
  heroTitle: 'Midscene.js',
  heroSubtitle: 'AI 驱动，愉悦的 UI 自动化体验',

  // Banner - Stats
  githubStars: 'Github Stars',
  activeUsers: '活跃用户',

  // Banner - CTA Buttons
  introduction: '介绍',
  quickStart: '快速开始',

  // Feature Sections - CLIENTS
  clientsTitle: '平台',
  clientsHeading: 'Web、iOS、Android 等多端支持',
  clientsDesc1: '用自然语言跨平台控制浏览器和移动应用',
  clientsDesc2: '在 Web Voyager 基准测试中获得超高分数',

  // Feature Sections - Platforms
  platformWeb: 'Web',
  platformIOS: 'iOS',
  platformAndroid: 'Android',
  platformAnyInterface: '任意界面',
  platformWebDesc:
    '与 Puppeteer 或 Playwright 集成，或使用桥接模式控制桌面浏览器。',
  platformIOSDesc:
    '使用 Javascript SDK 配合 WebDriverAgent 控制本地 iOS 设备。',
  platformAndroidDesc: '使用 Javascript SDK 配合 adb 控制本地 Android 设备。',
  platformAnyInterfaceDesc: '视觉建模支持任意界面的自动化，突破 DOM 限制。',

  // Feature Sections - MODELS
  modelsTitle: '模型',
  modelsHeading: 'UI 自动化的 AI 模型',
  modelsDesc1: '支持 GPT-4o、Qwen2.5-VL、豆包、Gemini 和 UI-TARS',
  modelsDesc2: '推荐使用视觉语言模型，可靠且成本低',
  modelsDesc3: '无 DOM 限制 - 适用于任何可视化界面',
  modelName: '模型名称',
  modelDesc: '选择多模态 LLM 或视觉语言模型，满足你的自动化需求。',

  // Feature Sections - DEBUGGING
  debuggingTitle: '调试',
  debuggingHeading: '可视化报告和工具',
  debuggingDesc1: '交互式可视化报告，理解测试执行过程',
  debuggingDesc2: '内置 Playground 用于调试和测试',
  debuggingDesc3: 'Chrome 插件提供浏览器内体验',

  // API names
  apiAction: 'aiAction',
  apiTap: 'aiTap',
  apiPlayback: '回放报告',
  apiActionDesc: '使用自然语言指令自动规划并执行复杂的 UI 操作。',
  apiTapDesc: '使用自然语言描述点击或触摸 UI 元素。',
  apiPlaybackDesc: '可视化报告，用于理解、回放和调试测试执行过程。',
};
