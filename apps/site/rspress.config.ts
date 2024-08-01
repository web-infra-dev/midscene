import * as path from 'path';
import { defineConfig } from 'rspress/config';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title: 'MidScene.js',
  description: 'Your AI-Driven UI Compass',
  icon: '/midscene-icon.png',
  logo: {
    light: '/midscene_with_text_light.png',
    dark: '/midscene_with_text_dark.png',
  },
  themeConfig: {
    darkMode: false,
    socialLinks: [{ icon: 'github', mode: 'link', content: 'https://github.com/web-infra-dev/midscene' }],
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
  },
  globalStyles: path.join(__dirname, 'styles/index.css'),
  locales: [
    {
      lang: 'en',
      // The label in nav bar to switch language
      label: 'English',
      title: 'MidScene.js',
      description: 'MidScene.js',
    },
    {
      lang: 'zh',
      // The label in nav bar to switch language
      label: '简体中文',
      title: 'MidScene.js',
      description: 'MidScene.js',
    },
  ],
  lang: 'en',
});
