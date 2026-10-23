import path from 'node:path';
import { digest, requireValue } from './config.mjs';

const textFile =
  /\.(?:[cm]?[jt]sx?|json|html|css|scss|mdx?|ya?ml|vue|svelte|py|go|rs)$/i;
const sensitive = /(?:^|\/)(?:\.env(?:\.|$)|[^/]*\.(?:pem|key|p12)$)/i;
const encodePath = (name) => name.split('/').map(encodeURIComponent).join('/');

// Read only bounded, immutable GitHub blobs. Repository text is data, never authority.
export async function collectContext({ api, pr, policy }) {
  requireValue(/^[a-f0-9]{40}$/.test(pr.base?.sha), 'Missing base revision');
  requireValue(
    pr.base.repo?.private === false,
    'Public reports require a public repository',
  );
  const sources = [];
  const limitations = [];
  let remaining = 100_000;
  function add(id, kind, text, metadata = {}) {
    const original = String(text ?? '');
    const content = original.slice(0, Math.min(16_000, remaining));
    remaining -= content.length;
    const truncated = content.length !== original.length;
    sources.push({
      id,
      kind,
      ...metadata,
      content,
      digest: digest(original),
      truncated,
    });
    if (truncated) limitations.push(`Context truncated: ${id}`);
  }
  add('pr', 'pull-request', `${pr.title}\n${pr.body ?? ''}`, {
    url: pr.html_url,
  });
  const files = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await api(
      'GET',
      `/pulls/${pr.number}/files?per_page=100&page=${page}`,
    );
    files.push(...batch);
    if (batch.length < 100) break;
  }
  requireValue(files.length === pr.changed_files, 'Incomplete PR file listing');
  const exclusions = policy.planning.excludePrefixes ?? [];
  const changes = files.map((file) => ({
    path: file.filename,
    status: file.status,
    excluded: exclusions.some((prefix) => file.filename.startsWith(prefix)),
  }));
  const selected = files.filter(
    (file) => !changes.find((item) => item.path === file.filename).excluded,
  );
  if (selected.length > 30)
    limitations.push(
      'More than 30 relevant files; context collection is incomplete',
    );
  const visited = new Set();
  async function read(name, ref, kind) {
    const id = `${ref}:${name}`;
    if (visited.has(id) || remaining <= 0) return;
    visited.add(id);
    if (!textFile.test(name) || sensitive.test(name)) return;
    let blob;
    try {
      blob = await api('GET', `/contents/${encodePath(name)}?ref=${ref}`);
    } catch (error) {
      if (error.status === 404) return;
      throw error;
    }
    if (
      blob.type !== 'file' ||
      blob.encoding !== 'base64' ||
      blob.size > 100_000
    ) {
      limitations.push(`Source unavailable or too large: ${id}`);
      return;
    }
    const content = Buffer.from(blob.content, 'base64').toString('utf8');
    add(id, kind, content, { path: name, revision: ref });
    return content;
  }
  for (const file of selected.slice(0, 30)) {
    if (sensitive.test(file.filename)) {
      limitations.push(`Sensitive path omitted: ${file.filename}`);
      continue;
    }
    add(`diff:${file.filename}`, 'diff', file.patch ?? '[Patch unavailable]', {
      path: file.filename,
    });
    if (!file.patch) limitations.push(`Patch unavailable: ${file.filename}`);
    const content =
      file.status === 'removed'
        ? undefined
        : await read(file.filename, pr.head.sha, 'head-code');
    if (file.status !== 'added')
      await read(
        file.previous_filename ?? file.filename,
        pr.base.sha,
        'base-code',
      );
    // A bounded first dependency hop; deeper dependencies remain outside this phase.
    const imports = [
      ...(content ?? '').matchAll(
        /(?:from\s*|import\s*)['"]([.][.\/][^'"]+)['"]/g,
      ),
    ].slice(0, 3);
    for (const [, specifier] of imports) {
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(file.filename), specifier),
      );
      if (target.startsWith('../')) continue;
      const candidates = path.posix.extname(target)
        ? [target]
        : [
            `${target}.ts`,
            `${target}.tsx`,
            `${target}.js`,
            `${target}/index.ts`,
          ];
      for (const candidate of candidates)
        if (await read(candidate, pr.head.sha, 'related-code')) break;
    }
  }
  for (const name of ['AGENTS.md', 'README.md', 'package.json'])
    await read(name, pr.base.sha, 'repository-context');
  const issues = [
    ...new Set(
      [...(pr.body ?? '').matchAll(/(?:^|\s)#(\d+)\b/g)].map((match) =>
        Number(match[1]),
      ),
    ),
  ];
  if (issues.length > 5)
    limitations.push(
      'More than five referenced issues; only the first five were collected',
    );
  for (const number of issues.slice(0, 5)) {
    if (number === pr.number) continue;
    try {
      const issue = await api('GET', `/issues/${number}`);
      if (!issue.pull_request)
        add(`issue:${number}`, 'issue', `${issue.title}\n${issue.body ?? ''}`, {
          url: issue.html_url,
        });
    } catch (error) {
      if (error.status !== 404) throw error;
      limitations.push(`Referenced issue unavailable: #${number}`);
    }
  }
  const current = await api('GET', `/pulls/${pr.number}`);
  requireValue(
    current.head.sha === pr.head.sha && current.base.sha === pr.base.sha,
    'PR changed during context collection',
  );
  if (remaining <= 0) limitations.push('Context character budget exhausted');
  return {
    repository: policy.repository,
    headSha: pr.head.sha,
    baseSha: pr.base.sha,
    changes,
    sources,
    limitations,
  };
}

export function contextManifest(context) {
  return {
    ...context,
    sources: context.sources.map(({ content, ...source }) => source),
  };
}
