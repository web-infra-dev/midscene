import { moduleTools, defineConfig } from '@modern-js/module-tools';

export default defineConfig({
  plugins: [moduleTools()],
  buildConfig: {
    buildType: 'bundle',
    format: 'cjs',
    target: 'es2019',
    outDir: './dist',
    dts: false,
    externals: ['express', 'cors', 'open'],
  },
});
