import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Keep executable docs examples, templates and site build configuration covered.
export const isDocumentation = (file) =>
  /(^|\/)README(?:\.[\w-]+)?\.md$/i.test(file) ||
  /^[^/]+\.md$/.test(file) ||
  /^(docs\/|\.changeset\/|apps\/site\/docs\/)/.test(file);

export function needsRuntimeChecks(files) {
  return files.some((file) => !isDocumentation(file));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let code = true;
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    const base = event.pull_request?.base.sha ?? event.before;
    const head = event.pull_request?.head.sha ?? process.env.GITHUB_SHA;
    if (base && !/^0+$/.test(base)) {
      const range = event.pull_request
        ? `${base}...${head}`
        : `${base}..${head}`;
      const files = execFileSync(
        'git',
        ['diff', '--no-renames', '--name-only', '-z', range],
        {
          encoding: 'utf8',
        },
      )
        .split('\0')
        .filter(Boolean);
      code = needsRuntimeChecks(files);
    }
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `code=${code}\n`);
  console.log(
    code
      ? 'Runtime checks required.'
      : 'Documentation only: runtime jobs skipped.',
  );
}
