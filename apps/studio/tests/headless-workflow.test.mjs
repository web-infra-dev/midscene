import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const repoRootDir = path.resolve(path.dirname(__filename), '..', '..', '..');
const workflowPath = path.join(
  repoRootDir,
  '.github/workflows/studio-headless-linux.yml',
);

describe('Studio headless workflow', () => {
  it('uses an Xvfb screen large enough for the Studio Electron window', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const xvfbScreenArg = '--server-args="-screen 0 1920x1080x24"';

    expect(workflow).toContain(
      `xvfb-run -a ${xvfbScreenArg} pnpm --dir apps/studio run test:smoke`,
    );
    expect(workflow).toContain(
      `xvfb-run -a ${xvfbScreenArg} pnpm --dir apps/studio run test:smoke:ai`,
    );
    expect(workflow).toContain(
      `xvfb-run -a ${xvfbScreenArg} pnpm --dir apps/studio run test:smoke:web-preview`,
    );
  });

  it('runs the Web preview e2e test in the Studio headless workflow', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('Run Studio Web preview e2e test');
    expect(workflow).toContain('MIDSCENE_STUDIO_RUN_WEB_PREVIEW_E2E');
  });
});
