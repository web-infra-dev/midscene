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

it.each(['directory', 'entry'])(
  'materializes a %s report with its screenshots and task-scoped references',
  (kind) => {
    const root = mkdtempSync(join(tmpdir(), 'executor-reports-'));
    roots.push(root);
    const source = join(root, 'source');
    mkdirSync(join(source, 'screenshots'), { recursive: true });
    writeFileSync(join(source, 'index.html'), '<html>report</html>');
    writeFileSync(join(source, 'screenshots', 'image.png'), 'image bytes');
    const reports = createExecutorReports(join(root, 'output'));
    const reference = reports.materialize(
      kind === 'directory' ? source : join(source, 'index.html'),
    );
    const entry = reports.resolve(reference);
    expect(entry).toMatch(/index\.html$/);
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
