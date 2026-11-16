import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';

export function getGitHubReleaseMetadataUrl({ owner, repo, version }) {
  return `https://api.github.com/repos/${owner}/${repo}/releases/tags/${version}`;
}

function getResponseErrorMessage(response) {
  return `Response code ${response.status} (${response.statusText})`;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function downloadUrlToFile({
  destinationPath,
  dispatcher,
  fetchImpl = fetch,
  fsApi = fs,
  headers,
  url,
}) {
  const response = await fetchImpl(url, {
    ...(dispatcher ? { dispatcher } : {}),
    ...(headers ? { headers } : {}),
  });

  if (!response.ok) {
    throw new Error(getResponseErrorMessage(response));
  }

  const arrayBuffer = await response.arrayBuffer();
  await fsApi.writeFile(destinationPath, Buffer.from(arrayBuffer));
}

export async function getGitHubReleaseAssetApiUrl({
  assetName,
  dispatcher,
  fetchImpl = fetch,
  owner,
  repo,
  version,
  githubToken,
}) {
  const metadataUrl = getGitHubReleaseMetadataUrl({ owner, repo, version });
  const response = await fetchImpl(metadataUrl, {
    ...(dispatcher ? { dispatcher } : {}),
    headers: {
      Accept: 'application/vnd.github+json',
      ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(getResponseErrorMessage(response));
  }

  const release = await response.json();
  const asset = Array.isArray(release.assets)
    ? release.assets.find((item) => item?.name === assetName)
    : undefined;

  if (!asset?.url) {
    throw new Error(
      `Release asset ${assetName} not found in ${owner}/${repo}@${version}`,
    );
  }

  if (new URL(asset.url).origin !== 'https://api.github.com') {
    throw new Error('Release asset API URL must use https://api.github.com');
  }

  return asset.url;
}

export async function downloadGitHubReleaseAssetWithApiFallback({
  assetName,
  destinationPath,
  directUrl,
  dispatcher,
  githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
  fetchImpl = fetch,
  fsApi = fs,
  owner,
  repo,
  version,
}) {
  try {
    await downloadUrlToFile({
      destinationPath,
      dispatcher,
      fetchImpl,
      fsApi,
      url: directUrl,
    });
    return;
  } catch (directError) {
    let assetApiUrl;
    try {
      assetApiUrl = await getGitHubReleaseAssetApiUrl({
        assetName,
        dispatcher,
        githubToken,
        fetchImpl,
        owner,
        repo,
        version,
      });
    } catch (fallbackError) {
      throw new Error(
        `Failed to download ${assetName}: browser download failed: ${getErrorMessage(
          directError,
        )}; API metadata fallback failed: ${getErrorMessage(fallbackError)}`,
      );
    }

    try {
      await downloadUrlToFile({
        destinationPath,
        dispatcher,
        fetchImpl,
        fsApi,
        headers: {
          Accept: 'application/octet-stream',
          ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
        },
        url: assetApiUrl,
      });
    } catch (fallbackError) {
      throw new Error(
        `Failed to download ${assetName}: browser download failed: ${getErrorMessage(
          directError,
        )}; API asset fallback failed: ${getErrorMessage(fallbackError)}`,
      );
    }
  }
}
