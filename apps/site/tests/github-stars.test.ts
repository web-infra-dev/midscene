import { describe, expect, it, vi } from 'vitest';
import {
  GITHUB_STARS_DEV_PLACEHOLDER,
  getGitHubStars,
} from '../scripts/github-stars';

function githubResponse(stars: number): Response {
  return new Response(JSON.stringify({ stargazers_count: stars }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getGitHubStars', () => {
  it('fetches and formats the current star count with authentication', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(githubResponse(14_420));

    await expect(
      getGitHubStars({
        strict: true,
        token: 'test-token',
        fetchImpl,
        retryDelayMs: 0,
      }),
    ).resolves.toBe('14k+');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer test-token',
    });
  });

  it('retries transient failures before returning a fresh value', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(githubResponse(14_420));

    await expect(
      getGitHubStars({
        strict: true,
        token: 'test-token',
        fetchImpl,
        retryDelayMs: 0,
      }),
    ).resolves.toBe('14k+');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('fails a production build instead of emitting a stale value', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 403 }));

    await expect(
      getGitHubStars({
        strict: true,
        token: 'test-token',
        fetchImpl,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(
      '[midscene-docs] Failed to fetch GitHub stars after 3 attempts: GitHub API returned HTTP 403',
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('requires authentication for production builds', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      getGitHubStars({ strict: true, fetchImpl, retryDelayMs: 0 }),
    ).rejects.toThrow(
      '[midscene-docs] GITHUB_TOKEN is required for production site builds',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses a non-numeric placeholder when development fetches fail', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network unavailable'));
    const warn = vi.fn();

    await expect(
      getGitHubStars({
        strict: false,
        fetchImpl,
        retryDelayMs: 0,
        warn,
      }),
    ).resolves.toBe(GITHUB_STARS_DEV_PLACEHOLDER);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('using development placeholder --'),
    );
  });
});
