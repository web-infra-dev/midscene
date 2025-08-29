import { defineConfig, moduleTools } from '@modern-js/module-tools';

export default defineConfig({
  plugins: [moduleTools()],
  buildConfig: {
    // Provide explicit input entries so Modern can run JS compilation/dts tasks.
    // The package's runtime entry points live under `bin/` (server.js and cli).
    input: {
      server: './bin/server.js',
      cli: './bin/ios-playground',
    },
    buildType: 'bundle',
    format: 'cjs',
    target: 'es2019',
    outDir: './dist',
    dts: false,
    externals: ['express', 'cors', 'open'],
  },
});
