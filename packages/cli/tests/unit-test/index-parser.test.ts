import { readFileSync } from 'node:fs';
import { parseIndexYaml } from '@/config-factory';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Only mock readFileSync
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('@/cli-utils', () => ({
  matchYamlFiles: vi.fn().mockResolvedValue(['test.yml']),
}));

describe('Index YAML parser functions', () => {
  const mockIndexYamlPath = '/test/index.yml';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('parseIndexYaml returns correct config for valid YAML', async () => {
    const mockYamlContent = `
order: 
  - "*.yml"
concurrent: 2
continueOnError: true
web:
  url: "http://example.com"
output:
  path: "/test/output"
  format: "json"
`;

    vi.mocked(readFileSync).mockReturnValue(mockYamlContent);

    const config = await parseIndexYaml(mockIndexYamlPath);

    expect(config.concurrent).toBe(2);
    expect(config.continueOnError).toBe(true);
    expect(config.web?.url).toBe('http://example.com');
    expect(config.outputPath).toBe('/test/output');
    expect(config.patterns).toEqual(['*.yml']);
  });

  test('parseIndexYaml uses default values when not specified', async () => {
    const mockYamlContent = `
order: 
  - "*.yml"
`;

    vi.mocked(readFileSync).mockReturnValue(mockYamlContent);

    const config = await parseIndexYaml(mockIndexYamlPath);

    expect(config.concurrent).toBe(1);
    expect(config.continueOnError).toBe(false);
  });
});
