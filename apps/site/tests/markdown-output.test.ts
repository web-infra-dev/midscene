import { describe, expect, it } from '@rstest/core';
import { isAnchorOutsideMarkdown } from '../plugins/anchor-excludes';
import { polishMarkdown } from '../plugins/markdown-output';
import { CHROME_WEB_STORE_URL } from '../theme/components/chrome-web-store';

describe('Markdown output', () => {
  it('unescapes heading ids', () => {
    expect(
      polishMarkdown(
        '# Title \\{#get-started}\n\n### Verify the device \\{#verify-device-connection}',
      ),
    ).toBe(
      '# Title {#get-started}\n\n### Verify the device {#verify-device-connection}',
    );
  });

  it('turns the Chrome extension button into a link', () => {
    expect(
      polishMarkdown(
        '1. Install:\n\n   <ChromeExtensionButton linkLabel="Install Midscene" />',
      ),
    ).toBe(`1. Install:\n\n   [Install Midscene](${CHROME_WEB_STORE_URL})`);
  });

  it('collapses runs of empty lines', () => {
    expect(polishMarkdown('a\n\n\n\nb\n')).toBe('a\n\nb\n');
  });

  it('leaves code blocks unchanged', () => {
    const code = [
      '```md',
      '# Title \\{#id}',
      '',
      '',
      '',
      '<ChromeExtensionButton linkLabel="x" />',
      '```',
    ].join('\n');
    expect(polishMarkdown(code)).toBe(code);
  });
});

describe('anchor check excludes', () => {
  it('excludes anchors that Rspress cannot see on the target page', () => {
    for (const url of [
      './reference/#common',
      '../reference/index.mdx#interaction-methods',
      '/zh/reference/#深度定位deeplocate',
      './reference/#%E4%BD%BF%E7%94%A8%E5%9B%BE%E7%89%87%E4%BD%9C%E4%B8%BA%E6%8F%90%E7%A4%BA%E8%AF%8D',
      './model-api-setup.mdx#glm-v',
      '../platforms/web#chrome-extension-faq',
      '#verify-device-connection',
    ]) {
      expect(isAnchorOutsideMarkdown(url)).toBe(true);
    }
  });

  it('keeps checking other anchors', () => {
    for (const url of [
      './model-api-setup#does-not-exist',
      // A known anchor on another page.
      './faq#common',
      './integrate-with-playwright#faq',
      '#does-not-exist',
      './reference/',
    ]) {
      expect(isAnchorOutsideMarkdown(url)).toBe(false);
    }
  });
});
