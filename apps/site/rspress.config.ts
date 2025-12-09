import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import { pluginLlms } from '@rspress/plugin-llms';
import { pluginSitemap } from '@rspress/plugin-sitemap';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title:
    'Midscene - AI UI Automation, AI Testing, Computer Use, Browser Use, Android Use',
  description:
    'It offers JavaScript SDK, Chrome extension, and support for scripting in YAML.',
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
    editLink: {
      docRepoBaseUrl:
        'https://github.com/web-infra-dev/midscene/tree/main/apps/site/docs',
    },
    sidebar: {
      '/': [
        {
          text: 'Getting started',
          items: [
            {
              text: 'Introduction',
              link: '/introduction',
            },
            {
              text: 'Model strategy 🔥',
              link: '/model-strategy',
            },
            {
              text: 'Model configuration',
              link: '/model-config',
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
            {
              text: 'API reference (web browser)',
              link: '/web-api-reference',
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
              text: 'Getting started',
              link: '/android-getting-started',
            },
            {
              text: 'API reference (Android)',
              link: '/android-api-reference',
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
              text: 'Getting started',
              link: '/ios-getting-started',
            },
            {
              text: 'API reference (iOS)',
              link: '/ios-api-reference',
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
              text: 'Workflow in YAML format',
              link: '/automate-with-scripts-in-yaml',
            },
            {
              text: 'Caching AI planning & locate',
              link: '/caching',
            },
            {
              text: 'Integrate Midscene with any interface',
              link: '/integrate-with-any-interface',
            },
          ],
        },
        {
          text: 'API and config',
          items: [
            {
              text: 'API reference (Common)',
              link: '/api',
            },
          ],
        },
        {
          text: 'Advanced',
          items: [
            {
              text: 'FAQ',
              link: '/faq',
            },
            {
              text: 'Expose agent as MCP server',
              link: '/mcp',
            },
            {
              text: 'Use JavaScript to optimize your workflow',
              link: '/use-javascript-to-optimize-ai-automation-code',
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
              link: '/zh/index.html',
            },
            {
              text: '模型策略',
              link: '/zh/model-strategy',
            },
            {
              text: '模型配置 🔥',
              link: '/zh/model-config',
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
            {
              text: 'API 参考（Web 浏览器）',
              link: '/zh/web-api-reference',
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
              text: '开始使用',
              link: '/zh/android-getting-started',
            },
            {
              text: 'API 参考（Android）',
              link: '/zh/android-api-reference',
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
              text: '开始使用',
              link: '/zh/ios-getting-started',
            },
            {
              text: 'API 参考（iOS）',
              link: '/zh/ios-api-reference',
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
              text: 'YAML 格式的工作流',
              link: '/zh/automate-with-scripts-in-yaml',
            },
            {
              text: '缓存 AI 规划和定位',
              link: '/zh/caching',
            },
            {
              text: '将 Midscene 集成到任意界面',
              link: '/zh/integrate-with-any-interface',
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
          ],
        },
        {
          text: '进阶',
          items: [
            {
              text: '常见问题 FAQ',
              link: '/zh/faq',
            },
            {
              text: 'MCP 服务',
              items: [
                { text: 'Web (桥接模式)', link: '/zh/mcp-web' },
                { text: 'Android', link: '/zh/mcp-android' },
                { text: 'iOS', link: '/zh/mcp-ios' },
              ],
            },
            {
              text: '使用 JavaScript 优化工作流',
              link: '/zh/use-javascript-to-optimize-ai-automation-code',
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
    source: {
      preEntry: ['./theme/tailwind.css'],
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
