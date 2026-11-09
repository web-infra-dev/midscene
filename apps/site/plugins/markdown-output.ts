import type { RspressPlugin } from '@rspress/core';
import { CHROME_WEB_STORE_URL } from '../theme/components/chrome-web-store';

const fence = /^\s*(```|~~~)/;
// Rspress escapes `{#id}` in headings so MDX does not read it as an
// expression, and SSG-MD writes the escaped text to the Markdown output.
const escapedHeadingId = /^(#{1,6} .*?)\s*\\\{#([^}\s]+)\}\s*$/;
// SSG-MD writes a Markdown block that contains JSX (for example a list item
// with a component) as source text, so the component tag reaches the output.
const chromeExtensionButton =
  /<ChromeExtensionButton\s+linkLabel="([^"]*)"\s*\/>/g;

// Cleans up the Markdown that SSG-MD writes for llms.txt, llms-full.txt, and
// the per-page `.md` files. Code blocks are left as they are.
export function polishMarkdown(markdown: string) {
  const output: string[] = [];
  let inFence = false;
  let blankLines = 0;
  for (const line of markdown.split('\n')) {
    if (fence.test(line)) inFence = !inFence;
    if (inFence || fence.test(line)) {
      blankLines = 0;
      output.push(line);
      continue;
    }
    if (line.trim() === '') {
      blankLines += 1;
      // Components that render nothing leave runs of empty lines.
      if (blankLines > 1) continue;
      output.push('');
      continue;
    }
    blankLines = 0;
    output.push(
      line
        .replace(escapedHeadingId, '$1 {#$2}')
        .replace(
          chromeExtensionButton,
          (_, label: string) => `[${label}](${CHROME_WEB_STORE_URL})`,
        ),
    );
  }
  return output.join('\n');
}

// The parts of the Rsbuild `processAssets` context used below. Rspress types
// plugins in `builderConfig` loosely, and the site does not depend on
// @rsbuild/core directly.
interface ProcessAssetsContext {
  assets: Record<string, { source(): string | Buffer }>;
  compilation: { updateAsset(name: string, source: unknown): void };
  compiler: {
    webpack: { sources: { RawSource: new (source: string) => unknown } };
  };
}

function polishMarkdownAssets({
  assets,
  compilation,
  compiler,
}: ProcessAssetsContext) {
  for (const name of Object.keys(assets)) {
    if (!/\.(md|txt)$/.test(name)) continue;
    const markdown = assets[name].source().toString();
    const polished = polishMarkdown(markdown);
    if (polished === markdown) continue;
    compilation.updateAsset(
      name,
      new compiler.webpack.sources.RawSource(polished),
    );
  }
}

export function pluginMarkdownOutput(): RspressPlugin {
  return {
    name: 'midscene-markdown-output',
    builderConfig: {
      plugins: [
        {
          name: 'midscene-markdown-output',
          setup(api) {
            api.processAssets(
              // SSG-MD emits the Markdown in the `optimize-transfer` stage.
              { stage: 'report', environments: ['node_md'] },
              polishMarkdownAssets,
            );
          },
        },
      ],
    },
  };
}
