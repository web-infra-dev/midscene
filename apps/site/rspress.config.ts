import * as path from 'node:path';
import { defineConfig } from 'rspress/config';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title: 'Midscene.js',
  search: {
    codeBlocks: true,
  },
  description:
    'Automate browser actions, extract data, and perform assertions using AI. It offers JavaScript SDK, Chrome extension, and support for scripting in YAML.',
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
          text: 'Usage',
          items: [
            {
              text: 'Automate with Scripts in YAML',
              link: '/automate-with-scripts-in-yaml',
            },
            {
              text: 'Bridge Mode by Chrome Extension',
              link: '/bridge-mode-by-chrome-extension',
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
              text: 'API Reference',
              link: '/api',
            },
            {
              text: 'Caching',
              link: '/caching',
            },
          ],
        },
        {
          text: 'AI Model',
          items: [
            {
              text: 'Prompting Tips',
              link: '/prompting-tips',
            },
            {
              text: 'Choose a Model for Midscene.js',
              link: '/choose-a-model',
            },
            {
              text: 'Config Model and Provider',
              link: '/model-provider',
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
              text: 'Data Privacy',
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
              text: '通过 Chrome 插件快速体验',
              link: '/zh/quick-experience',
            },
          ],
        },
        {
          text: '使用指南',
          items: [
            {
              text: '使用 YAML 格式的自动化脚本',
              link: '/zh/automate-with-scripts-in-yaml',
            },
            {
              text: '使用 Chrome 插件的桥接模式（Bridge Mode）',
              link: '/zh/bridge-mode-by-chrome-extension',
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
              text: 'API 参考',
              link: '/zh/api',
            },
            {
              text: '缓存',
              link: '/zh/caching',
            },
          ],
        },
        {
          text: 'AI 模型',
          items: [
            {
              text: '编写提示词（指令）的技巧',
              link: '/zh/prompting-tips',
            },
            {
              text: '选择 AI 模型',
              link: '/zh/choose-a-model',
            },
            {
              text: '配置模型和服务商',
              link: '/zh/model-provider',
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
      title: 'Midscene.js',
      description: 'Midscene.js',
    },
    {
      lang: 'zh',
      label: '简体中文',
      title: 'Midscene.js',
      description: 'Midscene.js',
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
  },
  lang: 'en',
});
