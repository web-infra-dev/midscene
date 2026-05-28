import { defineConfig } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginWorkspaceDev } from 'rsbuild-plugin-workspace-dev';
import {
  commonIgnoreWarnings,
  createTypeCheckPlugin,
} from '../../scripts/rsbuild-utils.ts';

export default defineConfig({
  tools: {
    rspack: {
      ignoreWarnings: commonIgnoreWarnings,
    },
  },
  server: {
    port: 3001,
  },
  plugins: [
    pluginReact(),
    pluginNodePolyfill(),
    createTypeCheckPlugin(),
    pluginWorkspaceDev({
      projects: {
        '@midscene/report': {
          skip: true,
        },
      },
    }),
  ],
});
