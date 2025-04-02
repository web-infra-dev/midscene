import path from 'node:path';
import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { modulePluginNodePolyfill } from '@modern-js/plugin-module-node-polyfill';
import { version } from './package.json';
const externals = [
  'playwright',
  'bufferutil',
  'utf-8-validate',
  'antd',
  '@ant-design/icons',
  'react',
  'react-dom',
];

const commonConfig = {
  asset: {
    svgr: true,
  },
  autoExternal: false,
  externals: [...externals],
  target: 'es2020',
  minify: process.env.CI
    ? {
        compress: true,
      }
    : undefined,
  define: {
    __VERSION__: version,
  },
};

export default defineConfig({
  buildConfig: [
    {
      ...commonConfig,
      alias: {
        async_hooks: path.join(__dirname, './src/blank_polyfill.ts'),
      },
      dts: false,
      input: {
        index: 'src/index.tsx',
      },
      platform: 'browser',
      outDir: 'dist',
      target: 'es2020',
      externals: [...externals],
    },
  ],
  plugins: [
    moduleTools(),
    modulePluginNodePolyfill({
      excludes: ['console'],
    }),
  ],
  buildPreset: 'npm-component',
});
