import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWorkflowProjectSync } from '../src/cli/workflow-project';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const writeConfig = (source: string): string => {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-project-config-'));
  directories.push(directory);
  const path = join(directory, 'midscene.workflow.config.cjs');
  writeFileSync(path, source);
  return path;
};

describe('workflow project config', () => {
  it('loads root and workflow file selection', () => {
    const path = writeConfig(`
      module.exports = {
        root: './e2e',
        files: {
          include: ['workflows/**/*.{yaml,yml}'],
          exclude: ['workflows/**/*.draft.yaml'],
        },
        nodes: [],
      };
    `);

    const project = loadWorkflowProjectSync(path);

    expect(project.root).toBe('./e2e');
    expect(project.files).toEqual({
      include: ['workflows/**/*.{yaml,yml}'],
      exclude: ['workflows/**/*.draft.yaml'],
    });
  });

  it('loads document nodes and setupDocument without executing it', async () => {
    const marker = vi.fn();
    (globalThis as Record<string, unknown>).__workflowSetupMarker = marker;
    const path = writeConfig(`
      module.exports = {
        nodes: [],
        documentNodes: [],
        setupDocument() {
          globalThis.__workflowSetupMarker();
          return { ready: true };
        },
      };
    `);

    const project = loadWorkflowProjectSync<{ ready: boolean }>(path);

    expect(marker).not.toHaveBeenCalled();
    expect(project.documentNodes.names()).toEqual([]);
    expect(await project.setupDocument?.({} as never)).toEqual({ ready: true });
    expect(marker).toHaveBeenCalledOnce();
    (globalThis as Record<string, unknown>).__workflowSetupMarker = undefined;
  });

  it('rejects invalid document lifecycle config', () => {
    const path = writeConfig(
      'module.exports = { nodes: [], setupDocument: true };',
    );

    expect(() => loadWorkflowProjectSync(path)).toThrow(
      'Workflow config setupDocument must be a function.',
    );

    const invalidNodes = writeConfig(
      'module.exports = { nodes: [], documentNodes: true };',
    );
    expect(() => loadWorkflowProjectSync(invalidNodes)).toThrow(
      'Workflow config documentNodes must be an array.',
    );

    const removedSetup = writeConfig(
      'module.exports = { nodes: [], setupWorkflow() {} };',
    );
    expect(() => loadWorkflowProjectSync(removedSetup)).toThrow(
      'setupWorkflow is no longer supported',
    );
  });

  it.each([
    [
      'root',
      'module.exports = { nodes: [], root: "" };',
      'root must be a non-empty string',
    ],
    [
      'files',
      'module.exports = { nodes: [], files: [] };',
      'files must be an object',
    ],
    [
      'missing include',
      'module.exports = { nodes: [], files: {} };',
      'files.include must be an array',
    ],
    [
      'empty include',
      'module.exports = { nodes: [], files: { include: [] } };',
      'files.include must be a non-empty array',
    ],
    [
      'absolute pattern',
      'module.exports = { nodes: [], files: { include: ["/outside/*.yaml"] } };',
      'must be relative to the project root',
    ],
    [
      'parent pattern',
      'module.exports = { nodes: [], files: { include: ["../outside/*.yaml"] } };',
      'must not contain a ".." path segment',
    ],
    [
      'negated include',
      'module.exports = { nodes: [], files: { include: ["!draft.yaml"] } };',
      'Use files.exclude instead',
    ],
    [
      'negated exclude',
      'module.exports = { nodes: [], files: { include: ["*.yaml"], exclude: ["!keep.yaml"] } };',
      'files.exclude[0] must not be a negated pattern',
    ],
    [
      'non-POSIX separator',
      'module.exports = { nodes: [], files: { include: ["flows\\\\*.yaml"] } };',
      'must use POSIX path separators',
    ],
    [
      'invalid exclude',
      'module.exports = { nodes: [], files: { include: ["*.yaml"], exclude: true } };',
      'files.exclude must be an array',
    ],
  ])('rejects invalid %s config', (_name, source, message) => {
    const path = writeConfig(source);
    expect(() => loadWorkflowProjectSync(path)).toThrow(message);
  });
});
