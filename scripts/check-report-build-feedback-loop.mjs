#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCoreReportTemplateModules } from './report-template-utils.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const coreDistDir = path.join(repositoryRoot, 'packages/core/dist');

// Validate the full-build baseline before reproducing the state transition that
// previously caused Report to embed the template written into Core dist.
validateCoreReportTemplateModules(coreDistDir);

execFileSync(
  'pnpm',
  [
    'exec',
    'nx',
    'build',
    '@midscene/report',
    '--skip-nx-cache',
    '--exclude-task-dependencies',
  ],
  {
    cwd: repositoryRoot,
    stdio: 'inherit',
  },
);

// The shared validator rejects recursive HTML and verifies that the rebuild
// wrote the exact current Report output to both standalone Core modules.
validateCoreReportTemplateModules(coreDistDir);
console.log('Report rebuild has no template feedback loop.');
