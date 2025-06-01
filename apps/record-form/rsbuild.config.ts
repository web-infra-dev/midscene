import { defineConfig } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  dev: {
    port: 3001,
  },
  plugins: [pluginReact(), pluginNodePolyfill()],
});
