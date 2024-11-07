import * as path from 'node:path';
import { defineConfig } from 'rspress/config';

// [{
//   "type": "section-header",
//   "label": "Getting Started"
// },
// {
//   "type": "dir",
//   "name": "getting-started",
//   "label": "Getting Started"
// },
// "introduction",
// "quick-start",
// "demo",
// "chrome-extension",
// {
//   "type": "divider"
// },
// {
//   "type": "section-header",
//   "label": "Usage"
// },
// "api",
// "cli",
// "cache",
// "model-provider",
// {
//   "type": "divider"
// },
// {
//   "type": "section-header",
//   "label": "More"
// },
// "prompting-tips",
// "faq"
// ]

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
      '/docs/': [
        {
          text: 'Getting Started',
          items: [
            // 填入一个对象
            {
              text: 'Introduction',
              link: '/docs/introduction',
            },
            {
              text: 'Quick Start',
              link: '/docs/quick-start',
            },
            {
              text: 'Demo',
              link: '/docs/demo',
            },
            {
              text: 'Chrome Extension',
              link: '/docs/chrome-extension',
            },
          ],
        },
        {
          text: 'Usage',
          items: [
            {
              text: 'API',
              link: '/docs/api',
            },
            {
              text: 'CLI',
              link: '/docs/cli',
            },
            {
              text: 'Cache',
              link: '/docs/cache',
            },
            {
              text: 'Model Provider',
              link: '/docs/model-provider',
            },
          ],
        },
        {
          text: 'More',
          items: [
            {
              text: 'Prompting Tips',
              link: '/docs/prompting-tips',
            },
            {
              text: 'FAQ',
              link: '/docs/faq',
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
