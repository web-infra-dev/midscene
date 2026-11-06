import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  notesEnd,
  notesStart,
  prepareReleaseNotes,
  readHighlights,
  replaceGeneratedNotes,
  writeReleaseArchives,
} from '../release-notes.mjs';

const roots = [];
const rawNotes = [
  '<!-- Release notes generated using configuration in .github/release.yml at abc123 -->',
  "## What's Changed",
  '* fix(core): show {limit} <value> by @example in https://github.com/web-infra-dev/midscene/pull/2',
  '* feat(core): use `Array<T>` by @example in https://github.com/web-infra-dev/midscene/pull/1',
  '## New Contributors',
  '* @example made their first contribution in https://github.com/web-infra-dev/midscene/pull/1',
  '**Full Changelog**: https://github.com/web-infra-dev/midscene/compare/v1.9.0...v1.10.0',
].join('\n');
const history =
  '\n\n## v0.11 - Historical title\n\n<video src="old.mp4" controls/>\n\n[Old docs](./reference)\n';
const fixture = () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'midscene-release-archives-'),
  );
  roots.push(root);
  fs.mkdirSync(path.join(root, '.github/release-notes'), { recursive: true });
  for (const language of ['en', 'zh']) {
    const directory = path.join(root, 'apps/site/docs', language);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'changelog.mdx'),
      `# ${language}\n\n${notesStart}\n${notesEnd}${history}`,
    );
  }
  return root;
};
const highlight = (root, language, body) =>
  fs.writeFileSync(
    path.join(
      root,
      '.github/release-notes',
      `v1_10_0.highlight.${language}.md`,
    ),
    body,
  );
const options = (root, fetchImpl) => ({
  root,
  version: '1.10.0',
  releaseType: 'patch',
  repository: 'web-infra-dev/midscene',
  token: 'test-token',
  targetCommit: 'abc123',
  previousTag: 'v1.9.0',
  outputDirectory: path.join(root, 'runner'),
  fetchImpl,
});

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe('release highlights', () => {
  it.each(['major', 'minor'])(
    'requires bilingual content for the %s input',
    (releaseType) => {
      const root = fixture();
      expect(() => readHighlights(root, '1.10.0', releaseType)).toThrow(
        'highlight.en.md',
      );
      highlight(root, 'en', '## New feature\n\nUseful details.');
      expect(() => readHighlights(root, '1.10.0', releaseType)).toThrow(
        'highlight.zh.md',
      );
      highlight(root, 'zh', '## 标题\n\n<!-- TODO -->');
      expect(() => readHighlights(root, '1.10.0', releaseType)).toThrow(
        'highlight.zh.md',
      );
      highlight(root, 'zh', '## 新功能\n\n使用说明。');
      expect(readHighlights(root, '1.10.0', releaseType).zh).toContain(
        '使用说明',
      );
    },
  );

  it('allows a patch without highlights but rejects incomplete pairs, including empty files', () => {
    const root = fixture();
    expect(readHighlights(root, '1.10.0', 'patch')).toEqual({ en: '', zh: '' });
    highlight(root, 'en', '');
    expect(() => readHighlights(root, '1.10.0', 'patch')).toThrow(
      'highlight.en.md',
    );
    highlight(root, 'en', 'Details');
    expect(() => readHighlights(root, '1.10.0', 'patch')).toThrow(
      'highlight.zh.md',
    );
  });

  it('checks the literal input, without inferring minor from version numbers', () => {
    expect(readHighlights(fixture(), '1.10.0', '1.10.0')).toEqual({
      en: '',
      zh: '',
    });
  });
});

describe('release archives and site changelogs', () => {
  it('rebuilds in semantic order, replaces reruns, and preserves both historical pages', () => {
    const root = fixture();
    const generate = (version, highlights) =>
      writeReleaseArchives({ root, version, highlights, rawNotes });
    generate('1.10.0', {
      en: '## Feature\n\nEnglish details',
      zh: '## 功能\n\n中文说明',
    });
    generate('1.9.0', { en: '', zh: '' });
    const githubBody = generate('1.10.0', {
      en: 'Updated details',
      zh: '更新后的说明',
    });
    for (const language of ['en', 'zh']) {
      const page = fs.readFileSync(
        path.join(root, 'apps/site/docs', language, 'changelog.mdx'),
        'utf8',
      );
      expect(page.endsWith(`${notesEnd}${history}`)).toBe(true);
      expect(page.match(/## v1\.10\.0/g)).toHaveLength(1);
      expect(page.indexOf('## v1.10.0')).toBeLessThan(
        page.indexOf('## v1.9.0'),
      );
      expect(page).not.toContain('English details');
      expect(page).toContain('{limit} <value>');
      expect(page).toContain('`Array<T>`');
      expect(page).not.toContain('Release notes generated');
      const archive = fs.readFileSync(
        path.join(
          root,
          '.github/release-notes',
          `v1_10_0.auto_generated.${language}.md`,
        ),
        'utf8',
      );
      expect(githubBody).toContain(archive);
      expect(archive).toContain('{limit} <value>');
      expect(archive).not.toContain('Release notes generated');
      expect(archive).toContain(
        language === 'en' ? '#### Features' : '#### 新特性',
      );
      expect(archive).toContain(
        language === 'en' ? '#### New Contributors' : '#### 新贡献者',
      );
    }
  });

  it('fails before writing archives if either historical page lacks its boundaries', () => {
    const root = fixture();
    fs.writeFileSync(
      path.join(root, 'apps/site/docs/zh/changelog.mdx'),
      history,
    );
    expect(() =>
      writeReleaseArchives({
        root,
        version: '1.10.0',
        highlights: { en: '', zh: '' },
        rawNotes,
      }),
    ).toThrow('region');
    expect(fs.readdirSync(path.join(root, '.github/release-notes'))).toEqual(
      [],
    );
  });

  it('rejects a missing language in previously archived versions', () => {
    const root = fixture();
    fs.writeFileSync(
      path.join(root, '.github/release-notes/v1_9_0.auto_generated.en.md'),
      'English',
    );
    expect(() =>
      writeReleaseArchives({
        root,
        version: '1.10.0',
        highlights: { en: '', zh: '' },
        rawNotes,
      }),
    ).toThrow('1.9.0');
  });

  it('rejects duplicate or reversed boundaries', () => {
    expect(() =>
      replaceGeneratedNotes(`${notesStart}${notesStart}${notesEnd}`, ''),
    ).toThrow('region');
    expect(() => replaceGeneratedNotes(`${notesEnd}${notesStart}`, '')).toThrow(
      'region',
    );
  });

  it('preserves MDX, Markdown syntax and code when rebuilding archived highlights', () => {
    const root = fixture();
    const content = [
      '<video src="https://example.com/demo.mp4" controls />',
      '<iframe src="https://example.com/report.html"></iframe>',
      '> Preview',
      '`Array<T>` and `{ timeout: 1000 }`',
      '```tsx\nconst value = <Widget prop={{ a: 1 }} />;\n## literal heading\n```',
    ].join('\n\n');
    writeReleaseArchives({
      root,
      version: '1.10.0',
      highlights: {
        en: `## Example\n\n${content}`,
        zh: `## 示例\n\n${content}`,
      },
      rawNotes,
    });
    // A subsequent release must also preserve content loaded from older archives.
    writeReleaseArchives({
      root,
      version: '1.10.1',
      highlights: { en: '', zh: '' },
      rawNotes,
    });
    for (const language of ['en', 'zh']) {
      const page = fs.readFileSync(
        path.join(root, 'apps/site/docs', language, 'changelog.mdx'),
        'utf8',
      );
      expect(page).toContain(content);
      expect(page).toContain(language === 'en' ? '#### Example' : '#### 示例');
    }
  });
});

describe('GitHub notes preparation', () => {
  it('uses an explicit commit and previous tag, archives notes, and keeps notification metadata', async () => {
    const root = fixture();
    const fetchImpl = rs.fn(async () => ({
      ok: true,
      json: async () => ({ body: rawNotes }),
    }));
    await prepareReleaseNotes(options(root, fetchImpl));
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      'https://api.github.com/repos/web-infra-dev/midscene/releases/generate-notes',
    );
    expect(JSON.parse(request.body)).toEqual({
      tag_name: 'v1.10.0',
      target_commitish: 'abc123',
      previous_tag_name: 'v1.9.0',
    });
    const body = fs.readFileSync(
      path.join(root, 'runner/release-notes.md'),
      'utf8',
    );
    expect(body).toContain('# English');
    expect(body).toContain('# 中文');
    const metadata = JSON.parse(
      fs.readFileSync(
        path.join(root, 'runner/release-notification.json'),
        'utf8',
      ),
    );
    expect(metadata.groups.map((group) => group.key)).toEqual(['feat', 'fix']);
    expect(metadata.changeCount).toBe(2);
  });

  it.each([
    { ok: false, status: 403 },
    { ok: true, json: async () => ({ body: ' ' }) },
    { ok: true, json: async () => ({}) },
  ])(
    'does not create archives on an unsuccessful GitHub response',
    async (response) => {
      const root = fixture();
      await expect(
        prepareReleaseNotes(options(root, async () => response)),
      ).rejects.toThrow();
      expect(fs.readdirSync(path.join(root, '.github/release-notes'))).toEqual(
        [],
      );
    },
  );

  it('rejects missing highlights before making requests', async () => {
    const root = fixture();
    const fetchImpl = rs.fn();
    await expect(
      prepareReleaseNotes({
        ...options(root, fetchImpl),
        releaseType: 'minor',
      }),
    ).rejects.toThrow('highlight.en.md');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips prereleases without reading highlights, fetching, or writing', async () => {
    const root = fixture();
    const fetchImpl = rs.fn();
    await prepareReleaseNotes({
      ...options(root, fetchImpl),
      version: '1.10.0-beta.0',
      releaseType: 'preminor',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fs.readdirSync(path.join(root, '.github/release-notes'))).toEqual(
      [],
    );
  });
});
