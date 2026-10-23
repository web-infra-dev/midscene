import { createHash } from 'node:crypto';

export function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function validatePolicy(policy) {
  requireValue(policy && typeof policy === 'object', 'Policy is required');
  requireValue(
    /^[\w.-]+\/[\w.-]+$/.test(policy.repository),
    'Expected repository owner/name',
  );
  requireValue(
    Number.isSafeInteger(policy.installationId) && policy.installationId > 0,
    'installationId must be a positive integer',
  );
  requireValue(
    typeof policy.environment === 'string' && policy.environment.length > 0,
    'Deployment environment is required',
  );
  requireValue(
    Array.isArray(policy.allowedOrigins) && policy.allowedOrigins.length > 0,
    'Explicit preview origins are required',
  );
  for (const origin of policy.allowedOrigins) {
    const url = new URL(origin);
    requireValue(url.origin === origin, 'Use exact origins without paths');
    requireValue(
      url.protocol === 'https:' ||
        (policy.allowLocalhost === true &&
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)),
      'Preview origins must use HTTPS (localhost is opt-in)',
    );
  }
  requireValue(
    typeof policy.revisionPath === 'string' &&
      policy.revisionPath.startsWith('/') &&
      !policy.revisionPath.startsWith('//'),
    'revisionPath must be an origin-relative JSON endpoint returning {sha}',
  );
  requireValue(
    Number.isInteger(policy.timeoutMs) &&
      policy.timeoutMs >= 1000 &&
      policy.timeoutMs <= 600_000,
    'timeoutMs must be between 1000 and 600000',
  );
  if (policy.planning) {
    requireValue(
      policy.planning.mode === 'context',
      'Unsupported planning mode',
    );
    requireValue(
      Array.isArray(policy.planning.paths) &&
        policy.planning.paths.length > 0 &&
        policy.planning.paths.length <= 20 &&
        policy.planning.paths.every(
          (value) =>
            typeof value === 'string' &&
            value.startsWith('/') &&
            !value.startsWith('//') &&
            !value.includes('\\'),
        ),
      'Approved planning paths are required',
    );
    requireValue(
      Number.isInteger(policy.planning.maxCriteria) &&
        policy.planning.maxCriteria >= 1 &&
        policy.planning.maxCriteria <= 10,
      'Planning maxCriteria must be 1..10',
    );
    requireValue(
      policy.planning.excludePrefixes === undefined ||
        (Array.isArray(policy.planning.excludePrefixes) &&
          policy.planning.excludePrefixes.every(
            (value) =>
              typeof value === 'string' &&
              value.length > 0 &&
              !value.startsWith('/'),
          )),
      'Invalid context exclusion prefixes',
    );
  }
  requireValue(
    Array.isArray(policy.criteria) &&
      (policy.criteria.length > 0 || policy.planning) &&
      policy.criteria.length <= 50,
    'At least one required criterion is necessary',
  );
  const ids = new Set();
  for (const criterion of policy.criteria) {
    requireValue(
      /^[A-Za-z0-9_-]{1,64}$/.test(criterion.id) &&
        !ids.has(criterion.id.toLowerCase()),
      'Criterion IDs must be unique, non-empty safe identifiers',
    );
    ids.add(criterion.id.toLowerCase());
    requireValue(
      typeof criterion.title === 'string' &&
        criterion.title.trim() &&
        criterion.title.length <= 240,
      'Criterion title is required',
    );
    requireValue(
      typeof criterion.path === 'string' &&
        criterion.path.startsWith('/') &&
        !criterion.path.startsWith('//'),
      'Criterion path must be origin-relative',
    );
    requireValue(
      Array.isArray(criterion.steps) &&
        criterion.steps.length > 0 &&
        criterion.steps.length <= 30 &&
        criterion.steps.at(-1).type === 'aiAssert',
      'Each criterion must end with an aiAssert',
    );
    for (const step of criterion.steps) {
      requireValue(
        ['aiAct', 'aiAssert'].includes(step.type) &&
          typeof step.prompt === 'string' &&
          step.prompt.length <= 4000 &&
          step.prompt.trim(),
        'Only explicit aiAct/aiAssert prompts are supported',
      );
    }
  }
  return policy;
}

export function allowedUrl(value, policy) {
  const url = new URL(value);
  requireValue(
    !url.username &&
      !url.password &&
      policy.allowedOrigins.includes(url.origin),
    'URL is outside configured preview origins',
  );
  return url;
}

export function policyDigest(policy) {
  return digest(JSON.stringify(policy));
}
