/**
 * Treats style / asset imports (`.less`, `.css`, `.scss`, `.svg`) as no-op
 * string assets during rstest runs. The UI tests in this repo never assert on
 * rendered CSS or SVG output, so this Rspack rule sidesteps the parser entirely
 * and keeps the test build lean.
 */
export const stubStyleRules = {
  tools: {
    rspack: (config: any) => {
      config.module ??= {};
      config.module.rules ??= [];
      config.module.rules.push(
        { test: /\.(less|css|scss)$/, type: 'asset/source' },
        { test: /\.svg(\?.*)?$/, type: 'asset/source' },
      );
      return config;
    },
  },
};
