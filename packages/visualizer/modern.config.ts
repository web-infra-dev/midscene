import { moduleTools, defineConfig } from '@modern-js/module-tools';
import { modulePluginDoc } from '@modern-js/plugin-module-doc';

export default defineConfig({
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
