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
  it('loads setupWorkflow without executing it', async () => {
    const marker = vi.fn();
    (globalThis as Record<string, unknown>).__workflowSetupMarker = marker;
    const path = writeConfig(`
      module.exports = {
        nodes: [],
        setupWorkflow() {
          globalThis.__workflowSetupMarker();
          return { ready: true };
        },
      };
    `);

    const project = loadWorkflowProjectSync<{ ready: boolean }>(path);

    expect(marker).not.toHaveBeenCalled();
    expect(await project.setupWorkflow?.({} as never)).toEqual({ ready: true });
    expect(marker).toHaveBeenCalledOnce();
    (globalThis as Record<string, unknown>).__workflowSetupMarker = undefined;
  });

  it('rejects a non-function setupWorkflow', () => {
    const path = writeConfig(
      'module.exports = { nodes: [], setupWorkflow: true };',
    );

    expect(() => loadWorkflowProjectSync(path)).toThrow(
      'Workflow config setupWorkflow must be a function.',
    );
  });
});
