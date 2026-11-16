import { promises as fs } from 'node:fs';
import { describe, expect, it, rs } from '@rstest/core';
import { downloadGitHubReleaseAssetWithApiFallback } from '../../scripts/github-release-asset.mjs';

const options = {
  assetName: 'tool.jar',
  dispatcher: undefined,
  destinationPath: '/tmp/tool.jar',
  directUrl: 'https://github.com/example/tool/releases/download/v1/tool.jar',
  owner: 'example',
  repo: 'tool',
  version: 'v1',
};
const metadataUrl =
  'https://api.github.com/repos/example/tool/releases/tags/v1';
const assetUrl =
  'https://api.github.com/repos/example/tool/releases/assets/123';

describe('GitHub release API authentication', () => {
  it('authenticates both fallback requests without sending the token to the public download URL', async () => {
    const writeFile = rs.fn<typeof fs.writeFile>();
    const fetchImpl = rs.fn<typeof fetch>(async (url, init) => {
      if (url === options.directUrl) {
        expect(init?.headers).toBeUndefined();
        return new Response(null, { status: 504 });
      }
      if (
        new Headers(init?.headers).get('Authorization') !== 'Bearer test-token'
      ) {
        return new Response(null, {
          status: 403,
          statusText: 'rate limit exceeded',
        });
      }
      if (url === metadataUrl) {
        return Response.json({
          assets: [{ name: options.assetName, url: assetUrl }],
        });
      }
      if (url === assetUrl) {
        expect(new Headers(init?.headers).get('Accept')).toBe(
          'application/octet-stream',
        );
        return new Response('downloaded asset');
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    await downloadGitHubReleaseAssetWithApiFallback({
      ...options,
      githubToken: 'test-token',
      fetchImpl,
      fsApi: { ...fs, writeFile },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(writeFile).toHaveBeenCalledWith(
      options.destinationPath,
      Buffer.from('downloaded asset'),
    );
  });

  it('does not require authentication when the direct download succeeds', async () => {
    const fetchImpl = rs.fn(async () => new Response('public asset'));
    await downloadGitHubReleaseAssetWithApiFallback({
      ...options,
      githubToken: '',
      fetchImpl,
      fsApi: { ...fs, writeFile: rs.fn<typeof fs.writeFile>() },
    });
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(options.directUrl, {});
  });

  it('rejects an asset URL outside the GitHub API before sending credentials', async () => {
    const fetchImpl = rs
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
      .mockResolvedValueOnce(
        Response.json({
          assets: [
            { name: options.assetName, url: 'https://example.com/asset' },
          ],
        }),
      );
    await expect(
      downloadGitHubReleaseAssetWithApiFallback({
        ...options,
        githubToken: 'test-token',
        fetchImpl,
        fsApi: { ...fs, writeFile: rs.fn<typeof fs.writeFile>() },
      }),
    ).rejects.toThrow('Release asset API URL must use https://api.github.com');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
