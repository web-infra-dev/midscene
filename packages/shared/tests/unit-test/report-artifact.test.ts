import {
  assertReportArtifactPath,
  parseReportArtifactManifest,
} from '@/report-artifact';
import { describe, expect, it } from '@rstest/core';

const manifest = () => ({
  schemaVersion: 1,
  kind: 'agent',
  status: 'complete',
  reportId: 'run-1',
  entry: 'index.html',
  groups: [
    {
      id: 'agent-1',
      attributes: { title: '登录验证', duration: 123 },
      dumps: ['data/run-1/1.json'],
    },
  ],
});

describe('directory report contract', () => {
  it('accepts portable Agent and Test metadata', () => {
    expect(parseReportArtifactManifest(manifest())).toEqual(manifest());
    expect(
      parseReportArtifactManifest({
        ...manifest(),
        kind: 'test',
        runner: 'data/run-1/runner.json',
      }).kind,
    ).toBe('test');
  });

  it.each([
    '../secret',
    '/absolute',
    'https://host/file',
    'data/../secret',
    'data/%2e%2e/secret',
    'data\\secret',
    'data/file.json?token=secret',
  ])('rejects a reference outside the artifact: %s', (path) => {
    expect(() => assertReportArtifactPath(path)).toThrow(
      'Invalid report artifact path',
    );
  });

  it('rejects unsupported schemas, malformed attributes and ambiguous groups', () => {
    expect(() =>
      parseReportArtifactManifest({ ...manifest(), schemaVersion: 99 }),
    ).toThrow('unsupported');
    expect(() =>
      parseReportArtifactManifest({
        ...manifest(),
        groups: [{ ...manifest().groups[0], attributes: { title: {} } }],
      }),
    ).toThrow('Invalid');
    expect(() =>
      parseReportArtifactManifest({
        ...manifest(),
        groups: [manifest().groups[0], manifest().groups[0]],
      }),
    ).toThrow('Invalid');
  });
});
