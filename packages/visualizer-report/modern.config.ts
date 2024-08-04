import path from 'node:path';
import { appTools, defineConfig } from '@modern-js/app-tools';

// https://modernjs.dev/en/configure/app/usage
export default defineConfig({
  source: {
    // Prevent pnpm workspace from causing dev dependencies on npm to take effect
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
    mainEntryName: 'index',
  },
  runtime: {
    router: true,
  },
  html: {
    disableHtmlFolder: true,
  },
  output: {
    disableSourceMap: false,
    distPath: {
      html: '.',
    },
  },
  plugins: [
    appTools({
      bundler: 'experimental-rspack',
    }),
  ],
});
