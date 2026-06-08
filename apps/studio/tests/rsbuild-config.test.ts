import { describe, expect, it } from 'vitest';
import config from '../rsbuild.config';

describe('rsbuild config', () => {
  it('uses relative renderer asset paths outside development', () => {
    expect(config.environments?.renderer?.output?.assetPrefix).toBe('./');
  });

  it('resolves renderer workspace packages from source-safe entries', () => {
    const alias = config.resolve?.alias as Record<string, string | false>;

    expect(alias['@midscene/playground-app$']).toContain(
      'packages/playground-app/src/index.ts',
    );
    expect(alias['@midscene/playground$']).toContain(
      'packages/playground/src/index.browser.ts',
    );
    expect(alias['@midscene/visualizer$']).toContain(
      'packages/visualizer/src/index.tsx',
    );
    expect(alias['@midscene/web/static$']).toContain(
      'packages/web-integration/src/static/index.ts',
    );
    expect(alias['@/utils$']).toContain(
      'packages/visualizer/src/utils/index.ts',
    );
  });
});
