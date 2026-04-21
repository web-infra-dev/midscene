import { describe, expect, it } from 'vitest';
import config from '../rsbuild.config';

describe('rsbuild config', () => {
  it('uses relative renderer asset paths outside development', () => {
    expect(config.environments?.renderer?.output?.assetPrefix).toBe('./');
  });
});
