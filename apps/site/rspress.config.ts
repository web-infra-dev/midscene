import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import { pluginClientRedirects } from '@rspress/plugin-client-redirects';
import { pluginLlms } from '@rspress/plugin-llms';
import { pluginSitemap } from '@rspress/plugin-sitemap';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title: 'Midscene - Vision-Driven UI Automation',
  description: 'Driving all platforms UI automation with vision-based model',
  icon: '/midscene-icon.png',
  logo: {
    light: '/midscene_with_text_light.png',
    dark: '/midscene_with_text_dark.png',
  },
  themeConfig: {
    lastUpdated: true,
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/web-infra-dev/midscene',
      },
      {
        icon: 'discord',
        mode: 'link',
        content: 'https://discord.gg/2JyBHxszE4',
      },
      {
        icon: 'x',
        mode: 'link',
        content: 'https://x.com/midscene_ai',
      },
      {
        icon: 'lark',
        mode: 'link',
        content:
          'https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=693v0991-a6bb-4b44-b2e1-365ca0d199ba',
      },
    ],
    editLink: {
      docRepoBaseUrl:
        'https://github.com/web-infra-dev/midscene/tree/main/apps/site/docs',
    },
    nav: [
      {
        text: 'Versions',
        items: [
          {
            text: 'Changelog',
            link: 'https://midscenejs.com/changelog',
          },
          {
            text: 'Midscene.js v0.x',
            link: 'https://v0.midscenejs.com',
          },
          {
            text: 'Midscene.js v1.x',
            link: 'https://midscenejs.com',
          },
        ],
      },
    ],
    sidebar: {
      '/': [
        {
          sectionHeaderText: 'Getting started',
        },
        {
          text: 'Introduction',
          link: '/introduction',
        },
        {
          text: 'Model strategy',
          link: '/model-strategy',
        },
        {
          text: 'Common model configuration 🔥',
          link: '/model-common-config',
        },
        {
          text: 'Control any platform with Skills 🔥',
          link: '/skills',
        },
        {
          text: 'Showcases',
          link: '/showcases',
        },
        {
          sectionHeaderText: 'Web browser',
        },
        {
          text: 'Quick experience by Chrome extension',
          link: '/quick-experience',
        },
        {
          text: 'Integrate with Playwright',
          link: '/integrate-with-playwright',
        },
        {
          text: 'Integrate with Puppeteer',
          link: '/integrate-with-puppeteer',
        },
        {
          text: 'Bridge to the desktop Chrome',
          link: '/bridge-mode',
        },
        {
          text: 'API reference (web browser)',
          link: '/web-api-reference',
        },
        {
          sectionHeaderText: 'Android',
        },
        {
          text: 'Introduction',
          link: '/android-introduction',
        },
        {
          text: 'Getting started',
          link: '/android-getting-started',
        },
        {
          text: 'API reference (Android)',
          link: '/android-api-reference',
        },
        {
          sectionHeaderText: 'iOS',
        },
        {
          text: 'Introduction',
          link: '/ios-introduction',
        },
        {
          text: 'Getting started',
          link: '/ios-getting-started',
        },
        {
          text: 'API reference (iOS)',
          link: '/ios-api-reference',
        },
        {
          sectionHeaderText: 'HarmonyOS',
        },
        {
          text: 'Introduction',
          link: '/harmony-introduction',
        },
        {
          text: 'Getting started',
          link: '/harmony-getting-started',
        },
        {
          text: 'API reference (HarmonyOS)',
          link: '/harmony-api-reference',
        },
        {
          sectionHeaderText: 'PC Desktop',
        },
        {
          text: 'Introduction',
          link: '/computer-introduction',
        },
        {
          text: 'Getting started',
          link: '/computer-getting-started',
        },
        {
          text: 'API reference (PC Desktop)',
          link: '/computer-api-reference',
        },
        {
          sectionHeaderText: 'YAML automation',
        },
        {
          text: 'YAML script runner',
          link: '/yaml-script-runner',
        },
        {
          text: 'Workflow in YAML format',
          link: '/automate-with-scripts-in-yaml',
        },
        {
          sectionHeaderText: 'More features',
        },
        {
          text: 'Caching AI planning & locate',
          link: '/caching',
        },
        {
          text: 'Integrate Midscene with any interface',
          link: '/integrate-with-any-interface',
        },
        {
          text: 'Expose agent as MCP server',
          link: '/mcp',
        },
        {
          sectionHeaderText: 'API and config',
        },
        {
          text: 'API reference (Common)',
          link: '/api',
        },
        {
          text: 'Model configuration',
          link: '/model-config',
        },
        {
          sectionHeaderText: 'Advanced',
        },
        {
          text: 'FAQ',
          link: '/faq',
        },
        {
          text: 'Use JavaScript to optimize your workflow',
          link: '/use-javascript-to-optimize-ai-automation-code',
        },
        {
          sectionHeaderText: 'More',
        },
        {
          text: 'Changelog',
          link: '/changelog',
        },
        {
          text: 'Awesome Midscene',
          link: '/awesome-midscene',
        },
        {
          text: 'LLMs.txt',
          link: '/llm-txt',
        },
        {
          text: 'Data privacy',
          link: '/data-privacy',
        },
      ],
      '/zh': [
        {
          text: '快速开始',
          sectionHeaderText: '快速开始',
        },
        {
          text: '介绍',
          link: '/zh/introduction',
        },
        {
          text: '模型策略',
          link: '/zh/model-strategy',
        },
        {
          text: '常用模型配置 🔥',
          link: '/zh/model-common-config',
        },
        {
          text: '使用 Skills 控制任意平台 🔥',
          link: '/zh/skills',
        },
        {
          text: '案例展示',
          link: '/zh/showcases',
        },
        {
          sectionHeaderText: 'Web 浏览器',
        },
        {
          text: '通过 Chrome 插件快速体验',
          link: '/zh/quick-experience',
        },
        {
          text: '集成到 Playwright',
          link: '/zh/integrate-with-playwright',
        },
        {
          text: '集成到 Puppeteer',
          link: '/zh/integrate-with-puppeteer',
        },
        {
          text: '桥接到桌面 Chrome',
          link: '/zh/bridge-mode',
        },
        {
          text: 'API 参考（Web 浏览器）',
          link: '/zh/web-api-reference',
        },
        {
          sectionHeaderText: 'Android',
        },
        {
          text: '介绍',
          link: '/zh/android-introduction',
        },
        {
          text: '开始使用',
          link: '/zh/android-getting-started',
        },
        {
          text: 'API 参考（Android）',
          link: '/zh/android-api-reference',
        },
        {
          sectionHeaderText: 'iOS',
        },
        {
          text: '介绍',
          link: '/zh/ios-introduction',
        },
        {
          text: '开始使用',
          link: '/zh/ios-getting-started',
        },
        {
          text: 'API 参考（iOS）',
          link: '/zh/ios-api-reference',
        },
        {
          sectionHeaderText: 'HarmonyOS',
        },
        {
          text: '介绍',
          link: '/zh/harmony-introduction',
        },
        {
          text: '开始使用',
          link: '/zh/harmony-getting-started',
        },
        {
          text: 'API 参考（HarmonyOS）',
          link: '/zh/harmony-api-reference',
        },
        {
          sectionHeaderText: 'PC 桌面',
        },
        {
          text: '介绍',
          link: '/zh/computer-introduction',
        },
        {
          text: '开始使用',
          link: '/zh/computer-getting-started',
        },
        {
          text: 'API 参考（PC 桌面）',
          link: '/zh/computer-api-reference',
        },
        {
          sectionHeaderText: 'YAML automation',
        },
        {
          text: 'YAML 脚本运行器',
          link: '/zh/yaml-script-runner',
        },
        {
          text: 'YAML 格式的工作流',
          link: '/zh/automate-with-scripts-in-yaml',
        },
        {
          sectionHeaderText: '更多特性',
        },
        {
          text: '缓存 AI 规划和定位',
          link: '/zh/caching',
        },
        {
          text: '将 Midscene 集成到任意界面',
          link: '/zh/integrate-with-any-interface',
        },
        {
          text: '将设备操作暴露为 MCP',
          link: '/zh/mcp',
        },
        {
          sectionHeaderText: 'API 与配置',
        },
        {
          text: 'API 参考（公共）',
          link: '/zh/api',
        },
        {
          text: '模型配置',
          link: '/zh/model-config',
        },
        {
          sectionHeaderText: '进阶',
        },
        {
          text: '常见问题 FAQ',
          link: '/zh/faq',
        },
        {
          text: '使用 JavaScript 优化工作流',
          link: '/zh/use-javascript-to-optimize-ai-automation-code',
        },
        {
          sectionHeaderText: '更多',
        },
        {
          text: '更新日志',
          link: '/zh/changelog',
        },
        {
          text: 'Awesome Midscene',
          link: '/zh/awesome-midscene',
        },
        {
          text: 'LLMs.txt',
          link: '/zh/llm-txt',
        },
        {
          text: '数据隐私',
          link: '/zh/data-privacy',
        },
      ],
    },
  },
  globalStyles: path.join(__dirname, 'styles/index.css'),
  locales: [
    {
      lang: 'en',
      label: 'English',
      title: 'Midscene.js - (AI UI Automation, AI Testing)',
      description:
        'Midscene.js - (AI driven UI automation framework, Computer Use, Browser Use, Android Use)',
    },
    {
      lang: 'zh',
      label: '简体中文',
      title: 'Midscene.js - (AI UI 自动化，AI 测试)',
      description:
        'Midscene.js - (AI 驱动的 UI 自动化框架，Computer Use, Browser Use, Android Use)',
    },
  ],
  builderConfig: {
    performance: {
      buildCache: false,
    },
    source: {
      preEntry: ['./theme/tailwind.css'],
    },
    html: {
      tags: [
        {
          tag: 'script',
          attrs: {
            type: 'text/javascript',
          },
          children: `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "rg8ztmkti8");`,
        },
      ],
      meta: {
        'google-site-verification':
          'knm1l2oVU9IkHaYjq9q-FnyiEMVkt1b6i2El54Hphdw',
      },
    },
  },
  lang: 'en',
  plugins: [
    pluginLlms([
      {
        llmsTxt: {
          name: 'llms.txt',
        },
        llmsFullTxt: {
          name: 'llms-full.txt',
        },
        include: ({ page }) => page.lang === 'en',
      },
      {
        llmsTxt: {
          name: 'zh/llms.txt',
        },
        llmsFullTxt: {
          name: 'zh/llms-full.txt',
        },
        include: ({ page }) => page.lang === 'zh',
      },
    ]),
    pluginSitemap({
      siteUrl: 'https://midscenejs.com',
    }),
    pluginClientRedirects({
      redirects: [
        {
          from: '^/integrate-with-android(?:\\.html)?/?$',
          to: '/android-getting-started',
        },
        {
          from: '^/android-playground(?:\\.html)?/?$',
          to: '/android-introduction',
        },
        {
          from: '^/ios-playground(?:\\.html)?/?$',
          to: '/ios-getting-started',
        },
        {
          from: '^/choose-a-model(?:\\.html)?/?$',
          to: '/model-strategy',
        },
        {
          from: '^/model-provider(?:\\.html)?/?$',
          to: '/model-common-config.html',
        },
        {
          from: '^/blog-use-javascript-to-optimize-ai-automation-code(?:\\.html)?/?$',
          to: '/use-javascript-to-optimize-ai-automation-code',
        },
        {
          from: '^/bridge-mode-by-chrome-extension(?:\\.html)?/?$',
          to: '/bridge-mode',
        },
        {
          from: '^/web-mcp(?:\\.html)?/?$',
          to: '/mcp',
        },
        {
          from: '^/mcp-android(?:\\.html)?/?$',
          to: '/mcp',
        },
        {
          from: '^/blog-support-android-automation(?:\\.html)?/?$',
          to: '/android-introduction',
        },
        {
          from: '^/blog-support-ios-automation(?:\\.html)?/?$',
          to: '/ios-introduction',
        },
        {
          from: '^/quick-experience-with-android(?:\\.html)?/?$',
          to: '/android-getting-started',
        },
        {
          from: '^/quick-experience-with-ios(?:\\.html)?/?$',
          to: '/ios-getting-started',
        },
        {
          from: '^/zh/web-mcp(?:\\.html)?/?$',
          to: '/zh/mcp',
        },
        {
          from: '^/zh/mcp-android(?:\\.html)?/?$',
          to: '/zh/mcp',
        },
        {
          from: '^/zh/blog-support-android-automation(?:\\.html)?/?$',
          to: '/zh/android-introduction',
        },
        {
          from: '^/zh/blog-support-ios-automation(?:\\.html)?/?$',
          to: '/zh/ios-introduction',
        },
        {
          from: '^/zh/quick-experience-with-android(?:\\.html)?/?$',
          to: '/zh/android-getting-started',
        },
        {
          from: '^/zh/quick-experience-with-ios(?:\\.html)?/?$',
          to: '/zh/ios-getting-started',
        },
        {
          from: '^/zh/choose-a-model(?:\\.html)?/?$',
          to: '/zh/model-strategy',
        },
        {
          from: '^/zh/model-provider(?:\\.html)?/?$',
          to: '/zh/model-common-config.html',
        },
        {
          from: '^/zh/blog-use-javascript-to-optimize-ai-automation-code(?:\\.html)?/?$',
          to: '/zh/use-javascript-to-optimize-ai-automation-code',
        },
        {
          from: '^/zh/bridge-mode-by-chrome-extension(?:\\.html)?/?$',
          to: '/zh/bridge-mode',
        },
        {
          from: '^/zh/android-playground(?:\\.html)?/?$',
          to: '/zh/android-introduction',
        },
        {
          from: '^/zh/ios-playground(?:\\.html)?/?$',
          to: '/zh/ios-getting-started',
        },
        {
          from: '^/command-line-tools(?:\\.html)?/?$',
          to: '/yaml-script-runner',
        },
        {
          from: '^/zh/command-line-tools(?:\\.html)?/?$',
          to: '/zh/yaml-script-runner',
        },
      ],
    }),
  ],
});
