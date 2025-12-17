import { commonIgnoreWarnings } from '@midscene/shared';
import { defineConfig } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginWorkspaceDev } from 'rsbuild-plugin-workspace-dev';

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
    pluginTypeCheck(),
    pluginWorkspaceDev({
      projects: {
        '@midscene/report': {
          skip: true,
        },
      },
    }),
  ],
});
