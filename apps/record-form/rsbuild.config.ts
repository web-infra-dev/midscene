import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';

export default defineConfig({
  dev: {
    port: 3001,
  },
  plugins: [pluginReact(), pluginNodePolyfill()],
});
