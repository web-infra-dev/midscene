const GITHUB_REPOSITORY = 'web-infra-dev/midscene';
const GITHUB_REPOSITORY_API_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;

export const GITHUB_STARS_DEV_PLACEHOLDER = '--';

interface GetGitHubStarsOptions {
  strict: boolean;
  token?: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  warn?: (message: string) => void;
}

function formatGitHubStars(stars: number): string {
  if (!Number.isFinite(stars) || stars <= 0) {
    throw new Error(
      `GitHub API returned an invalid stargazers_count: ${stars}`,
    );
  }

  return `${Math.floor(stars / 1000)}k+`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchGitHubStarsOnce(
  fetchImpl: typeof fetch,
  token: string | undefined,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(GITHUB_REPOSITORY_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'midscene-docs-build',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as { stargazers_count?: number };
    return formatGitHubStars(data.stargazers_count ?? Number.NaN);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getGitHubStars({
  strict,
  token,
  fetchImpl = fetch,
  maxAttempts,
  retryDelayMs = 500,
  timeoutMs = 5000,
  warn = console.warn,
}: GetGitHubStarsOptions): Promise<string> {
  if (strict && !token) {
    throw new Error(
      '[midscene-docs] GITHUB_TOKEN is required for production site builds',
    );
  }

  const attempts = maxAttempts ?? (strict ? 3 : 1);
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchGitHubStarsOnce(fetchImpl, token, timeoutMs);
    } catch (error) {
      lastError = toError(error);
      if (attempt < attempts) {
        await delay(retryDelayMs * attempt);
      }
    }
  }

  const message = `[midscene-docs] Failed to fetch GitHub stars after ${attempts} attempts: ${lastError?.message ?? 'unknown error'}`;
  if (strict) {
    throw new Error(message);
  }

  warn(
    `${message}; using development placeholder ${GITHUB_STARS_DEV_PLACEHOLDER}`,
  );
  return GITHUB_STARS_DEV_PLACEHOLDER;
}
