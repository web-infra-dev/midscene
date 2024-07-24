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
    socialLinks: [{ icon: 'gitlab', mode: 'link', content: 'https://github.com/web-infra-dev/midscene' }],
  },
  globalStyles: path.join(__dirname, 'styles/index.css'),
});
