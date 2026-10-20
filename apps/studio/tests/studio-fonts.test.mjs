import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appStyles = readFileSync(
  new URL('../src/renderer/App.css', import.meta.url),
  'utf8',
);
const interFontPath = new URL(
  '../src/renderer/assets/fonts/InterVariable.woff2',
  import.meta.url,
);

describe('Studio bundled fonts', () => {
  it('uses its bundled Inter variable font instead of a local font', () => {
    expect(existsSync(interFontPath)).toBe(true);
    expect(appStyles).toContain('@font-face');
    expect(appStyles).toContain('font-family: "Inter";');
    expect(appStyles).toContain('font-weight: 100 900;');
    expect(appStyles).toContain(
      'src: url("./assets/fonts/InterVariable.woff2") format("woff2");',
    );
    expect(appStyles).not.toContain('local("Inter")');
  });
});
