import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import { pluginLlms } from '@rspress/plugin-llms';
import { pluginSitemap } from '@rspress/plugin-sitemap';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title:
    '(AI UI Automation, AI Testing, Computer Use, Browser Use, Android Use)',
  description:
    'AI UI Automation, AI Testing, Computer Use, Browser Use, Android Use. It offers JavaScript SDK, Chrome extension, and support for scripting in YAML.',
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
          'https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=291q2b25-e913-411a-8c51-191e59aab14d',
      },
    ],
    locales: [
      {
        lang: 'en',
        outlineTitle: 'On this page',
        label: 'On this page',
        editLink: {
          docRepoBaseUrl:
            'https://github.com/web-infra-dev/midscene/tree/main/apps/site/docs',
          text: '📝 Edit this page on GitHub',
        },
      },
      {
        lang: 'zh',
        outlineTitle: '大纲',
        label: '大纲',
        editLink: {
          docRepoBaseUrl:
            'https://github.com/web-infra-dev/midscene/tree/main/apps/site/docs',
          text: '📝 在 GitHub 上编辑此页',
        },
      },
    ],
    sidebar: {
      '/': [
        {
          text: 'Getting started',
          items: [
            {
              text: 'Introduction',
              link: '/',
            },
            {
              text: 'Choose a model 🔥',
              link: '/choose-a-model',
            },
          ],
        },
        {
          text: 'Web browser',
          items: [
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
          ],
        },
        {
          text: 'Android',
          items: [
            {
              text: 'Introduction',
              link: '/android-introduction',
            },
            {
              text: 'Quick experience by playground',
              link: '/quick-experience-with-android',
            },
            {
              text: 'Integrate with Android (adb)',
              link: '/integrate-with-android',
            },
          ],
        },
        {
          text: 'iOS',
          items: [
            {
              text: 'Introduction',
              link: '/ios-introduction',
            },
            {
              text: 'Quick experience by playground',
              link: '/quick-experience-with-ios',
            },
            {
              text: 'Integrate with iOS (WebDriverAgent)',
              link: '/integrate-with-ios',
            },
          ],
        },
        {
          text: 'More feature',
          items: [
            {
              text: 'Command line tools',
              link: '/command-line-tools',
            },
            {
              text: 'Caching AI planning & locate',
              link: '/caching',
            },
          ],
        },
        {
          text: 'API and config',
          items: [
            {
              text: 'Javascript API reference',
              link: '/api',
            },
            {
              text: 'Workflow in YAML format',
              link: '/automate-with-scripts-in-yaml',
            },
            {
              text: 'Model and overall config',
              link: '/model-provider',
            },
          ],
        },
        {
          text: 'Advanced',
          items: [
            {
              text: 'Integrate Midscene with any interface',
              link: '/integrate-with-any-interface',
            },
            {
              text: 'Expose agent as MCP server',
              link: '/mcp',
            },
            {
              text: 'Use JavaScript to optimize your workflow',
              link: '/blog-programming-practice-using-structured-api',
            },
          ],
        },
        {
          text: 'FAQ',
          items: [
            {
              text: 'FAQ',
              link: '/faq',
            },
          ],
        },
        {
          text: 'More',
          items: [
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
        },
      ],
      '/zh': [
        {
          text: '快速开始',
          items: [
            {
              text: '介绍',
              link: '/zh/index',
            },
            {
              text: '选择 AI 模型 🔥',
              link: '/zh/choose-a-model',
            },
          ],
        },
        {
          text: 'Web 浏览器',
          items: [
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
          ],
        },
        {
          text: 'Android',
          items: [
            {
              text: '介绍',
              link: '/zh/android-introduction',
            },
            {
              text: '通过 Playground 快速体验',
              link: '/zh/quick-experience-with-android',
            },
            {
              text: '与 Android(adb) 集成',
              link: '/zh/integrate-with-android',
            },
          ],
        },
        {
          text: 'iOS',
          items: [
            {
              text: '介绍',
              link: '/zh/ios-introduction',
            },
            {
              text: '通过 Playground 快速体验',
              link: '/zh/quick-experience-with-ios',
            },
            {
              text: '与 iOS(WebDriverAgent) 集成',
              link: '/zh/integrate-with-ios',
            },
          ],
        },
        {
          text: '更多功能',
          items: [
            {
              text: '命令行工具',
              link: '/zh/command-line-tools',
            },
            {
              text: '缓存 AI 规划和定位',
              link: '/zh/caching',
            },
          ],
        },
        {
          text: 'API 与配置',
          items: [
            {
              text: 'JavaScript API 参考',
              link: '/zh/api',
            },
            {
              text: 'YAML 格式的工作流',
              link: '/zh/automate-with-scripts-in-yaml',
            },
            {
              text: '模型与整体配置',
              link: '/zh/model-provider',
            },
          ],
        },
        {
          text: '进阶',
          items: [
            {
              text: '将 Midscene 集成到任意界面',
              link: '/zh/integrate-with-any-interface',
            },
            {
              text: '暴露 Agent 为 MCP 服务',
              link: '/zh/mcp',
            },
            {
              text: '使用 JavaScript 优化工作流',
              link: '/zh/blog-programming-practice-using-structured-api',
            },
          ],
        },
        {
          text: '常见问题',
          items: [
            {
              text: '常见问题 FAQ',
              link: '/zh/faq',
            },
          ],
        },
        {
          text: '更多',
          items: [
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
    tools: {
      rspack: {
        watchOptions: {
          ignored: /node_modules/,
        },
      },
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
  ],
});
