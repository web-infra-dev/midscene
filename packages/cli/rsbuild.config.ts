import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: './src/benchmark-grounding/ui/index.tsx',
      brief: './src/benchmark-grounding/ui/brief.tsx',
    },
    tsconfigPath: 'tsconfig.build.json',
  },
  html: {
    inject: 'body',
    template: './src/benchmark-grounding/ui/index.html',
  },
  output: {
    distPath: { root: 'node_modules/.cache/benchmark-grounding-ui' },
    inlineScripts: true,
    injectStyles: true,
    dataUriLimit: Number.MAX_SAFE_INTEGER,
    sourceMap: false,
    legalComments: 'inline',
  },
  tools: {
    rspack: {
      module: { parser: { javascript: { dynamicImportMode: 'eager' } } },
    },
  },
});
