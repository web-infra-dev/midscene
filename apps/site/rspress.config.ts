import * as path from 'node:path';
import { defineConfig } from 'rspress/config';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title: 'Midscene.js',
  description:
    'Transform UI automation into a joyful experience with Midscene.js, enabling seamless interaction, querying, and assertions through natural language',
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
        icon: 'lark',
        mode: 'link',
        content:
          'https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=291q2b25-e913-411a-8c51-191e59aab14d',
      },
    ],
    footer: {
      message: `
        <footer class="footer">
          <div class="footer-content">
            <img src="/midscene-icon.png" alt="Midscene.js Logo" class="footer-logo" />
            <p class="footer-text">&copy; 2024 Midscene.js. All Rights Reserved.</p>
          </div>
        </footer>
      `,
    },
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
              text: 'Cache',
              link: '/cache',
            },
            {
              text: 'Customize Model and Provider',
              link: '/model-provider',
            },
          ],
        },
        {
          text: 'More',
          items: [
            {
              text: 'Prompting Tips',
              link: '/prompting-tips',
            },
            {
              text: 'FAQ',
              link: '/faq',
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
              link: '/zh/cache',
            },
            {
              text: '自定义模型和服务商',
              link: '/zh/model-provider',
            },
          ],
        },
        {
          text: '更多',
          items: [
            {
              text: '提示词技巧',
              link: '/zh/prompting-tips',
            },
            {
              text: '常见问题',
              link: '/zh/faq',
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
