// @rstest-environment jsdom
import { beforeEach, describe, expect, it } from '@rstest/core';
import { revealModelConfigSection } from '../theme/components/model-config-section-anchor';

describe('model configuration anchor navigation', () => {
  let section: HTMLDetailsElement;
  beforeEach(() => {
    document.body.innerHTML = `
      <details><summary><h3 id="qwen">Qwen</h3></summary>
        <span id="qwen3-vl"></span><span id="千问"></span>
      </details>
      <h2 id="next-steps">Next steps</h2>`;
    section = document.querySelector('details')!;
  });

  it('opens the heading target, including after manually collapsing it', () => {
    expect(revealModelConfigSection(section, '#qwen')).toBe(true);
    expect(section.open).toBe(true);
    section.open = false;
    revealModelConfigSection(section, '#qwen');
    expect(section.open).toBe(true);
  });

  it('opens legacy aliases and encoded anchors inside the section', () => {
    for (const hash of ['#qwen3-vl', `#${encodeURIComponent('千问')}`]) {
      section.open = false;
      expect(revealModelConfigSection(section, hash)).toBe(true);
      expect(section.open).toBe(true);
    }
  });

  it('leaves unrelated sections and invalid hashes unchanged', () => {
    for (const hash of ['#next-steps', '#missing', '', '#%']) {
      expect(revealModelConfigSection(section, hash)).toBe(false);
      expect(section.open).toBe(false);
    }
    section.open = true;
    revealModelConfigSection(section, '#next-steps');
    expect(section.open).toBe(true);
  });
});
