/**
 * Makes `.less` imports inert during rstest runs.
 *
 * Components pull their stylesheet in as a bare side-effect import
 * (`import './index.less'`), so Rspack has to resolve it at build time even
 * though no test ever reads the result -- `blackboard-highlights.test.ts`, for
 * example, runs under node and asserts on the class names that JSX emits, not
 * on any computed style. Without a rule the build hard-fails with
 * `Module parse failed ... use "@rsbuild/plugin-less"` before a single test
 * runs. These packages already build with `@rsbuild/plugin-less`, but adding it
 * here does not work: the 1.x line they pin crashes against the rsbuild 2.x
 * that rstest bundles (`TypeError: Cannot convert undefined or null to
 * object`), and moving to 2.x would change how they build for production. So
 * this rule sidesteps the parser instead.
 *
 * It is rstest's missing counterpart to vitest's `css: false` default, which
 * needs no preprocessor at all. rstest already empties plain `.css` without any
 * plugin, but that pre-filter is keyed on the extension, so `.less` never
 * reaches it -- even when the file holds nothing but valid plain CSS. Tracked
 * upstream at web-infra-dev/rstest#1696.
 *
 * Scoped deliberately to `.less`, and wired only into the projects whose tests
 * reach one. On rstest 0.11.5 a bare config already handles `.css` and `.svg`
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
