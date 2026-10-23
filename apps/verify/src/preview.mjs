import { allowedUrl } from './config.mjs';

// GitHub's latest status is authoritative. Never fall back to an older success.
export async function discoverPreview(api, policy, sha) {
  const deployments = await api(
    'GET',
    `/deployments?sha=${sha}&environment=${encodeURIComponent(policy.environment)}&per_page=100`,
  );
  const deployment = deployments
    .filter(
      (item) => item.sha === sha && item.environment === policy.environment,
    )
    .sort((a, b) => b.id - a.id)[0];
  if (!deployment)
    return {
      state: 'missing',
      title: 'Waiting for preview deployment',
      summary:
        'Deploy this PR head or register its existing preview with the CI reporting command.',
    };
  const [status] = await api(
    'GET',
    `/deployments/${deployment.id}/statuses?per_page=1`,
  );
  if (deployment.production_environment === true)
    return {
      state: 'blocked',
      title: 'Production deployment is not a PR preview',
      summary: 'Select a dedicated preview environment.',
      deployment,
    };
  if (status?.state !== 'success')
    return {
      state: status?.state ?? 'pending',
      deployment,
      title: 'Preview deployment is not ready',
      summary: `Latest deployment status: ${status?.state ?? 'pending'}. No functional verification has run. Wait for or repair the preview deployment.`,
    };
  let previewUrl;
  try {
    previewUrl = allowedUrl(status.environment_url, policy).href;
  } catch {
    return {
      state: 'blocked',
      deployment,
      title: 'Preview URL needs configuration',
      summary:
        'The deployment must supply an HTTPS environment_url on an operator-approved origin. Update the trusted policy if necessary.',
    };
  }
  return { state: 'ready', deployment, previewUrl };
}

export function samePreview(left, right) {
  return (
    left?.state === 'ready' &&
    right?.state === 'ready' &&
    left.deployment.id === right.deployment.id &&
    left.deployment.sha === right.deployment.sha &&
    left.previewUrl === right.previewUrl
  );
}
