import { defineConfig, moduleTools } from '@modern-js/module-tools';
import { modulePluginDoc } from '@modern-js/plugin-module-doc';

export default defineConfig({
  buildConfig: {
    asset: {
      svgr: true,
    },
  },
  plugins: [
    moduleTools(),
    modulePluginDoc({
      doc: {
        sidebar: false,
        hideNavbar: true,
      },
    }),
  ],
  buildPreset: 'npm-component',
});
