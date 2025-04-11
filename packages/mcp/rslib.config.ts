import { defineConfig } from '@rslib/core';
import { version } from './package.json';

export default defineConfig({
  source: {
    define: {
      __VERSION__: `'${version}'`,
    },
  },
  lib: [
    {
      format: 'esm',
      syntax: 'es2021',
      dts: true,
    },
    {
      format: 'cjs',
      syntax: 'es2021',
    },
  ],
});
