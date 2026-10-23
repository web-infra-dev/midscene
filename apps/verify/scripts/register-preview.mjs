import { appendFile } from 'node:fs/promises';
import { GitHub } from '../src/github.mjs';
import { registerPreview } from '../src/register-preview.mjs';

const env = process.env;
if (
  !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? '') ||
  !env.GITHUB_TOKEN
)
  throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
const github = new GitHub({});
try {
  const result = await registerPreview({
    api: (method, suffix, body) =>
      github.request(
        env.GITHUB_TOKEN,
        method,
        `/repos/${env.GITHUB_REPOSITORY}${suffix}`,
        body,
      ),
    number: Number(env.VERIFY_PR_NUMBER),
    sha: env.VERIFY_HEAD_SHA,
    previewUrl: env.VERIFY_PREVIEW_URL,
    environment: env.VERIFY_ENVIRONMENT,
  });
  if (env.GITHUB_OUTPUT)
    await appendFile(
      env.GITHUB_OUTPUT,
      `deployment-id=${result.deploymentId}\n`,
    );
  console.log(JSON.stringify(result));
} catch {
  // Avoid logging URL inputs or credential-bearing request errors in CI.
  console.error(
    'Preview registration failed. Check the PR head SHA, HTTPS URL, environment and token permissions (Pull requests read, Deployments write).',
  );
  process.exitCode = 1;
}
