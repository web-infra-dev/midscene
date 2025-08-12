import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      output: {
        distPath: {
          root: 'dist-inspect',
        },
        target: 'web',
      },
      autoExtension: false,
      autoExternal: false,
      format: 'iife',
      source: {
        entry: {
          htmlElement: 'src/extractor/index.ts',
          htmlElementDebug: 'src/extractor/debug.ts',
        },
      },
      syntax: 'esnext',
      tools: {
        rspack: {
          output: {
            library: {
              type: 'window',
              name: 'midscene_element_inspector',
            },
          },
        },
        bundlerChain: (chain, { CHAIN_ID }) => {
          chain.optimization.minimizer(CHAIN_ID.MINIMIZER.JS).tap((options) => {
            // license comments are not needed to be extracted
            options[0].extractComments = false;
            return options;
          });
        },
      },
    },
  ],
});
