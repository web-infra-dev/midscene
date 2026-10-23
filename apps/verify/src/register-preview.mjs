import { requireValue } from './config.mjs';

// Register an already-deployed preview. This never builds, merges or executes PR code.
export async function registerPreview({
  api,
  number,
  sha,
  previewUrl,
  environment,
}) {
  requireValue(Number.isSafeInteger(number) && number > 0, 'Invalid PR number');
  requireValue(
    /^[a-f0-9]{40}$/.test(sha ?? ''),
    'Explicit full deployed head SHA required',
  );
  requireValue(
    typeof environment === 'string' &&
      environment.trim().length > 0 &&
      environment.length <= 100,
    'Preview environment required',
  );
  const url = new URL(previewUrl);
  requireValue(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search,
    'Preview URL must use HTTPS without credentials, query or fragment',
  );
  const checkHead = async () => {
    const pr = await api('GET', `/pulls/${number}`);
    requireValue(
      pr.state === 'open' && pr.head.sha === sha,
      'Deployed SHA is not the current open PR head',
    );
  };
  await checkHead();
  const deployment = await api('POST', '/deployments', {
    ref: sha,
    environment,
    auto_merge: false,
    required_contexts: [],
    transient_environment: true,
    production_environment: false,
    task: 'midscene:preview',
    description: 'Register an existing PR preview for Midscene verification',
    payload: { source: 'midscene-verify-ci', pullRequest: number },
  });
  requireValue(
    Number.isSafeInteger(deployment.id) &&
      deployment.id > 0 &&
      deployment.sha === sha,
    'GitHub did not create the requested revision deployment',
  );
  // A push during registration must not publish a successful current-head claim.
  await checkHead();
  await api('POST', `/deployments/${deployment.id}/statuses`, {
    state: 'success',
    environment_url: url.href,
    auto_inactive: false,
    description:
      'Existing preview ready; functional verification has not run yet',
  });
  return {
    deploymentId: deployment.id,
    headSha: sha,
    pullRequest: number,
    environment,
    previewUrl: url.href,
  };
}
