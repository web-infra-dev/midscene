import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import {
  buildReleaseNotification,
  formatReleaseNotes,
} from './format-release-notes.mjs';

export const notesStart = '{/* release-notes:start */}';
export const notesEnd = '{/* release-notes:end */}';
const languages = ['en', 'zh'];

export const releaseFileStem = (version) => {
  if (!semver.valid(version) || semver.prerelease(version)) {
    throw new Error(`Expected a stable release version, received: ${version}`);
  }
  return `v${version.replaceAll('.', '_')}`;
};

export const readHighlights = (root, version, releaseType) => {
  const stem = releaseFileStem(version);
  const highlights = Object.fromEntries(
    languages.map((language) => {
      const file = path.join(
        root,
        '.github/release-notes',
        `${stem}.highlight.${language}.md`,
      );
      return [
        language,
        fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '',
      ];
    }),
  );
  const required =
    ['major', 'minor'].includes(releaseType) ||
    languages.some((language) =>
      fs.existsSync(
        path.join(
          root,
          '.github/release-notes',
          `${stem}.highlight.${language}.md`,
        ),
      ),
    );
  if (required) {
    for (const language of languages) {
      const body = highlights[language]
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^\s*#{1,6}\s+.*$/gm, '')
        .trim();
      if (!body) {
        throw new Error(
          `Missing or empty .github/release-notes/${stem}.highlight.${language}.md`,
        );
      }
    }
  }
  return highlights;
};

// Keep fenced examples intact when changing headings.
const mapMarkdownLines = (markdown, transform) => {
  let fence;
  return markdown
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (fence) {
        if (
          match &&
          match[1][0] === fence[0] &&
          match[1].length >= fence.length
        )
          fence = undefined;
        return line;
      }
      if (match) {
        fence = match[1];
        return line;
      }
      return transform(line);
    })
    .join('\n');
};

const nestHeadings = (markdown, levels) =>
  mapMarkdownLines(markdown, (line) =>
    line.replace(
      /^(#{1,6}) /,
      (_, hashes) => `${'#'.repeat(Math.min(6, hashes.length + levels))} `,
    ),
  );

export const replaceGeneratedNotes = (existing, generated) => {
  const start = existing.indexOf(notesStart);
  const end = existing.indexOf(notesEnd);
  if (
    start < 0 ||
    end < start ||
    existing.indexOf(notesStart, start + 1) >= 0 ||
    existing.indexOf(notesEnd, end + 1) >= 0
  ) {
    throw new Error(
      'Changelog must contain exactly one release-notes:start/end region',
    );
  }
  return `${existing.slice(0, start + notesStart.length)}\n\n${generated}${generated ? '\n\n' : ''}${existing.slice(end)}`;
};

const composeArchive = (version, highlight, rawNotes, language) =>
  `${[
    `## v${version}`,
    highlight &&
      `### ${language === 'zh' ? '亮点' : 'Highlights'}\n\n${nestHeadings(highlight, 2)}`,
    `### ${language === 'zh' ? '完整变更' : 'Changes'}\n\n${nestHeadings(formatReleaseNotes(rawNotes, language), 2)}`,
  ]
    .filter(Boolean)
    .join('\n\n')}\n`;

export const writeReleaseArchives = ({
  root,
  version,
  highlights,
  rawNotes,
}) => {
  if (!rawNotes.trim()) throw new Error('GitHub generated empty release notes');
  const stem = releaseFileStem(version);
  const directory = path.join(root, '.github/release-notes');
  const archives = new Map();
  if (fs.existsSync(directory)) {
    for (const file of fs.readdirSync(directory)) {
      const match = file.match(
        /^v(\d+)_(\d+)_(\d+)\.auto_generated\.(en|zh)\.md$/,
      );
      if (!match) continue;
      const archiveVersion = `${match[1]}.${match[2]}.${match[3]}`;
      releaseFileStem(archiveVersion);
      const entry = archives.get(archiveVersion) ?? {};
      entry[match[4]] = fs
        .readFileSync(path.join(directory, file), 'utf8')
        .trim();
      archives.set(archiveVersion, entry);
    }
  }
  const current = Object.fromEntries(
    languages.map((language) => [
      language,
      composeArchive(version, highlights[language], rawNotes, language),
    ]),
  );
  archives.set(version, current);
  const ordered = [...archives.entries()].sort(([a], [b]) =>
    semver.rcompare(a, b),
  );
  for (const [archiveVersion, entry] of ordered) {
    if (languages.some((language) => !entry[language]?.trim())) {
      throw new Error(
        `Missing bilingual release archive for ${archiveVersion}`,
      );
    }
  }
  // Validate both pages before changing any files. Preserve all historical bytes
  // outside the generated region, including old anchors and relative links.
  const pages = languages.map((language) => {
    const file = path.join(root, 'apps/site/docs', language, 'changelog.mdx');
    const content = ordered
      .map(([, entry]) => entry[language].trim())
      .join('\n\n');
    return [
      file,
      replaceGeneratedNotes(fs.readFileSync(file, 'utf8'), content),
    ];
  });
  fs.mkdirSync(directory, { recursive: true });
  for (const language of languages) {
    fs.writeFileSync(
      path.join(directory, `${stem}.auto_generated.${language}.md`),
      current[language],
    );
  }
  for (const [file, content] of pages) fs.writeFileSync(file, content);
  return `# English\n\n${current.en}\n# 中文\n\n${current.zh}`;
};

export const prepareReleaseNotes = async ({
  root,
  version,
  releaseType,
  repository,
  token,
  targetCommit,
  previousTag,
  outputDirectory,
  fetchImpl = fetch,
}) => {
  if (semver.prerelease(version)) return;
  const highlights = readHighlights(root, version, releaseType);
  if (!repository || !token || !targetCommit || !outputDirectory) {
    throw new Error(
      'Release notes require GITHUB_REPOSITORY, GITHUB_TOKEN, a target commit, and an output directory',
    );
  }
  const response = await fetchImpl(
    `https://api.github.com/repos/${repository}/releases/generate-notes`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        tag_name: `v${version}`,
        target_commitish: targetCommit,
        ...(previousTag ? { previous_tag_name: previousTag } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok)
    throw new Error(`GitHub release notes request failed (${response.status})`);
  const { body } = await response.json();
  if (typeof body !== 'string' || !body.trim())
    throw new Error('GitHub generated empty release notes');
  const githubBody = writeReleaseArchives({
    root,
    version,
    highlights,
    rawNotes: body,
  });
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'release-notes.md'), githubBody);
  fs.writeFileSync(
    path.join(outputDirectory, 'release-notification.json'),
    `${JSON.stringify(buildReleaseNotification(body), null, 2)}\n`,
  );
};
