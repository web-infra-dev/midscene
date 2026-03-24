import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packagesDir = path.resolve(__dirname, '..', '..', '..');

describe('MCP packages build config', () => {
  it('should have explicit publicPath in all MCP rslib configs to prevent Node.js runtime crash', () => {
    const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
    const mcpPackages = entries
      .filter((e) => e.isDirectory() && e.name.endsWith('-mcp'))
      .map((e) => e.name);

    expect(mcpPackages.length).toBeGreaterThan(0);

    for (const pkg of mcpPackages) {
      const configPath = path.join(packagesDir, pkg, 'rslib.config.ts');
      if (!fs.existsSync(configPath)) continue;

      const content = fs.readFileSync(configPath, 'utf-8');
      expect(
        content.includes('publicPath'),
        `${pkg}/rslib.config.ts must set publicPath to avoid "Automatic publicPath is not supported in this browser" error in Node.js`,
      ).toBe(true);
    }
  });
});
