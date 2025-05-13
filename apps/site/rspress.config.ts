import * as path from 'node:path';
import { pluginLlms } from '@rspress/plugin-llms';
import sitemap from 'rspress-plugin-sitemap';
import { defineConfig } from 'rspress/config';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title:
    '(AI UI Automation, AI Testing, Computer Use, Browser Use, Android Use)',
  search: {
    codeBlocks: true,
  },
  description:
    'AI UI Automation, AI Testing, Computer Use, Browser Use, Android Use. It offers JavaScript SDK, Chrome extension, and support for scripting in YAML.',
  icon: '/midscene-icon.png',
  logo: {
    light: '/midscene_with_text_light.png',
    dark: '/midscene_with_text_light.png',
  },
  themeConfig: {
    darkMode: false,
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
        outlineTitle: 'On This Page',
        label: 'On This Page',
      },
      {
        lang: 'zh',
        outlineTitle: '大纲',
        label: '大纲',
      },
    ],
    sidebar: {
      '/': [
        {
          text: 'Getting Started',
          items: [
            {
              text: 'Introduction',
              link: '/',
            },
            {
              text: 'Quick Experience by Chrome Extension',
              link: '/quick-experience',
            },
          ],
        },
        {
          text: 'Web Browser Automation',
          items: [
            {
              text: 'MCP Server',
              link: '/mcp',
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
              text: 'Bridge Mode by Chrome Extension',
              link: '/bridge-mode-by-chrome-extension',
            },
            {
              text: 'Caching',
              link: '/caching',
            },
          ],
        },
        {
          text: 'Android Automation',
          items: [
            {
              text: 'Quick Experience by Android Playground',
              link: '/quick-experience-with-android',
            },
            {
              text: 'Integrate with Android(adb)',
              link: '/integrate-with-android',
            },
          ],
        },
        {
          text: 'API and Usage',
          items: [
            {
              text: 'Automate with Scripts in YAML',
              link: '/automate-with-scripts-in-yaml',
            },
            {
              text: 'API Reference',
              link: '/api',
            },
          ],
        },
        {
          text: 'AI Model',
          items: [
            {
              text: 'Choose a Model 🔥',
              link: '/choose-a-model',
            },
            {
              text: 'Config Model and Provider',
              link: '/model-provider',
            },
            {
              text: 'Prompting Tips',
              link: '/prompting-tips',
            },
          ],
        },
        {
          text: 'More',
          items: [
            {
              text: 'FAQ',
              link: '/faq',
            },
            {
              text: 'LLMs.txt',
              link: '/llm-txt',
            },
            {
              text: 'Data Privacy',
              link: '/data-privacy',
            },
          ],
        },
        {
          text: 'Blog',
          items: [
            {
              text: 'Support Android Automation',
              link: '/blog-support-android-automation',
            },
            {
              text: 'Introducing Instant Actions and Deep Think',
              link: '/blog-introducing-instant-actions-and-deep-think',
            },
            {
              text: 'Using Structured API to Optimize Automation Code',
              link: '/blog-programming-practice-using-structured-api',
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
              text: '通过 Chrome 插件快速体验',
              link: '/zh/quick-experience',
            },
          ],
        },
        {
          text: 'Web 浏览器自动化',
          items: [
            {
              text: 'MCP 服务',
              link: '/zh/mcp',
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
              text: 'Chrome 桥接模式（Bridge Mode）',
              link: '/zh/bridge-mode-by-chrome-extension',
            },
            {
              text: '缓存',
              link: '/zh/caching',
            },
          ],
        },
        {
          text: 'Android 自动化',
          items: [
            {
              text: '使用 Android Playground 快速体验',
              link: '/zh/quick-experience-with-android',
            },
            {
              text: '与 Android(adb) 集成',
              link: '/zh/integrate-with-android',
            },
          ],
        },
        {
          text: 'API 和用法',
          items: [
            {
              text: '使用 YAML 格式的自动化脚本',
              link: '/zh/automate-with-scripts-in-yaml',
            },
            {
              text: 'API 参考',
              link: '/zh/api',
            },
          ],
        },
        {
          text: 'AI 模型',
          items: [
            {
              text: '选择 AI 模型 🔥',
              link: '/zh/choose-a-model',
            },
            {
              text: '配置模型和服务商',
              link: '/zh/model-provider',
            },
            {
              text: '编写提示词（指令）的技巧',
              link: '/zh/prompting-tips',
            },
          ],
        },
        {
          text: '更多',
          items: [
            {
              text: '常见问题 FAQ',
              link: '/zh/faq',
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
        {
          text: 'Blog',
          items: [
            {
              text: '支持 Android 自动化',
              link: '/zh/blog-support-android-automation',
            },
            {
              text: '即时操作和深度思考',
              link: '/zh/blog-introducing-instant-actions-and-deep-think',
            },
            {
              text: '使用结构化 API 优化自动化代码',
              link: '/zh/blog-programming-practice-using-structured-api',
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
    pluginLlms(),
    sitemap({
      domain: 'https://midscenejs.com',
    }),
  ],
});
