/**
 * Makes `.less` imports inert during rstest runs.
 *
 * Components pull their stylesheet in as a bare side-effect import
 * (`import './index.less'`), so Rspack has to resolve it at build time even
 * though no test ever reads the result -- `blackboard-highlights.test.ts`, for
 * example, runs under node and asserts on the class names that JSX emits, not
 * on any computed style. Without a rule the build hard-fails with
 * `Module parse failed ... use "@rsbuild/plugin-less"` before a single test
 * runs. `@rsbuild/plugin-less` would clear that by actually compiling the Less
 * into a stylesheet nobody reads, so this rule sidesteps the parser instead.
 * It is rstest's missing counterpart to vitest's `css: false` default.
 *
 * Scoped deliberately to `.less`, and wired only into the projects whose tests
 * reach one. On rstest 0.11.2 a bare config already handles `.css` and `.svg`
 * natively, and this repo has no `.scss` at all. Stubbing `.svg` is worse than
 * redundant: it swaps the URL a component imports for the raw SVG text, so the
 * markup a test asserts on stops matching the production build.
 */
export const stubStyleRules = {
  tools: {
    rspack: (config: any) => {
      config.module ??= {};
      config.module.rules ??= [];
      config.module.rules.push({ test: /\.less$/, type: 'asset/source' });
      return config;
    },
  },
};
