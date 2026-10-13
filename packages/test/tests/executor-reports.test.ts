import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createExecutorReports } from '../src/cli/executor-reports';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

it('copies immutable snapshots with screenshots without requiring an HTML entry', () => {
  const root = mkdtempSync(join(tmpdir(), 'executor-snapshot-'));
  roots.push(root);
  const source = join(root, 'source');
  mkdirSync(join(source, 'screenshots'), { recursive: true });
  const dumpPath = join(source, 'snapshot.json');
  writeFileSync(dumpPath, '{"executions":[]}');
  writeFileSync(join(source, 'screenshots', 'image.png'), 'image bytes');
  const reports = createExecutorReports(join(root, 'output'));
  const reference = reports.materializeSource({
    sourcePath: join(source, 'index.html'),
    dumpPath,
  });
  const snapshot = reports.resolveSource(reference)!;
  expect(snapshot.sourcePath).toBe(reports.resolve(reference));
  expect(snapshot.dumpPath).not.toBe(dumpPath);
  if (!snapshot.dumpPath) throw new Error('Expected a materialized snapshot');
  expect(readFileSync(snapshot.dumpPath, 'utf8')).toBe('{"executions":[]}');
  expect(
    readFileSync(
      join(dirname(snapshot.dumpPath), 'screenshots', 'image.png'),
      'utf8',
    ),
  ).toBe('image bytes');
  expect(
    createExecutorReports(join(root, 'other')).resolveSource(reference),
  ).toBeUndefined();
});

it.each(['directory', 'entry', 'named-entry'])(
  'materializes a %s report with its screenshots and task-scoped references',
  (kind) => {
    const root = mkdtempSync(join(tmpdir(), 'executor-reports-'));
    roots.push(root);
    const source = join(root, 'source');
    mkdirSync(join(source, 'screenshots'), { recursive: true });
    writeFileSync(join(source, 'index.html'), '<html>report</html>');
    writeFileSync(join(source, 'test-run.html'), '<html>report</html>');
    writeFileSync(join(source, 'screenshots', 'image.png'), 'image bytes');
    const reports = createExecutorReports(join(root, 'output'));
    const reference = reports.materialize(
      kind === 'directory'
        ? source
        : join(source, kind === 'named-entry' ? 'test-run.html' : 'index.html'),
    );
    const entry = reports.resolve(reference);
    expect(entry).toMatch(
      kind === 'named-entry' ? /report\.html$/ : /index\.html$/,
    );
    expect(readFileSync(entry, 'utf8')).toBe('<html>report</html>');
    expect(
      readFileSync(join(dirname(entry), 'screenshots', 'image.png'), 'utf8'),
    ).toBe('image bytes');
    expect(() => reports.resolve('/etc/passwd')).toThrow(
      'unknown report reference',
    );
    expect(() =>
      createExecutorReports(join(root, 'another-task')).resolve(reference),
    ).toThrow('unknown report reference');
  },
);

it('preserves partial collection diagnostics for HTML-only sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'executor-partial-'));
  roots.push(root);
  const path = join(root, 'source.html');
  writeFileSync(path, '<html>partial report</html>');
  const collection = {
    status: 'partial' as const,
    capturedAt: '2026-10-13T00:00:00Z',
    reason: 'live HTML without immutable snapshot',
  };
  const reports = createExecutorReports(join(root, 'output'));
  const reference = reports.materializeSource({ sourcePath: path, collection });
  expect(reports.resolveSource(reference)).toEqual({
    sourcePath: reports.resolve(reference),
    collection,
  });
});
