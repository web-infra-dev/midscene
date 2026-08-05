import path from 'node:path';
import { fileURLToPath } from 'node:url';

const categories = [
  { key: 'breaking', title: 'Breaking Changes 🍭' },
  { key: 'feat', title: 'Features 🎉' },
  { key: 'fix', title: 'Fixes 🐞' },
  { key: 'perf', title: 'Performance 🚀' },
  { key: 'refactor', title: 'Refactors ♻️' },
  { key: 'docs', title: 'Documentation 📖' },
  { key: 'test', title: 'Testing 🧪' },
  { key: 'build', title: 'Build 📦' },
  { key: 'maintenance', title: 'CI & Chore ⚙️' },
  { key: 'other', title: 'Other Changes' },
];
const notificationCategoryKeys = new Set(['breaking', 'feat', 'fix']);
const markdownSpecialCharacters = new Set([
  '\\',
  '`',
  '*',
  '_',
  '~',
  '[',
  ']',
  '<',
  '>',
]);

const conventionalTitlePattern =
  /^(?<type>[A-Za-z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:/;
const breakingTitlePattern = /^BREAKING(?:[ -]CHANGE)?:/i;
const changeTitlePattern =
  /^[*-] (?<title>.+?) by @[^ ]+ in (?<url>https:\/\/github\.com\/[^ ]+\/pull\/(?<pr>\d+))$/;
const sectionHeadingPattern = /^(?<marker>#{2,6}) (?<title>.+)$/;
const fullChangelogPattern = /^\*\*Full Changelog\*\*:/;

const trimBlankLines = (lines) => {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') {
    start += 1;
  }
  while (end > start && lines[end - 1].trim() === '') {
    end -= 1;
  }
  return lines.slice(start, end);
};

const categoryKeyForTitle = (title) => {
  if (breakingTitlePattern.test(title)) {
    return 'breaking';
  }

  const conventionalTitle = title.match(conventionalTitlePattern)?.groups;
  if (!conventionalTitle) {
    return 'other';
  }
  if (conventionalTitle.breaking) {
    return 'breaking';
  }

  const type = conventionalTitle.type.toLowerCase();
  if (type === 'breaking') {
    return 'breaking';
  }
  if (type === 'tests') {
    return 'test';
  }
  if (type === 'ci' || type === 'chore') {
    return 'maintenance';
  }
  if (categories.some((category) => category.key === type)) {
    return type;
  }
  return 'other';
};

const parseChangeLine = (line) => {
  const match = line.match(changeTitlePattern)?.groups;
  if (!match) {
    return undefined;
  }

  const conventionalTitle = match.title.match(conventionalTitlePattern)?.groups;
  return {
    categoryKey: categoryKeyForTitle(match.title),
    line,
    pr: match.pr,
    scope: conventionalTitle?.scope?.toLowerCase() ?? '',
    title: match.title.trim(),
    url: match.url,
  };
};

const parseReleaseNotes = (markdown) => {
  const normalizedMarkdown = markdown.replaceAll('\r', '').trim();
  const preamble = [];
  const sections = [];
  const fullChangelog = [];
  const changes = [];
  let currentSection;

  for (const line of normalizedMarkdown.split('\n')) {
    if (fullChangelogPattern.test(line)) {
      fullChangelog.push(line);
      continue;
    }

    const sectionHeading = line.match(sectionHeadingPattern)?.groups;
    if (sectionHeading) {
      currentSection = {
        lines: [],
        marker: sectionHeading.marker,
        title: sectionHeading.title,
      };
      sections.push(currentSection);
      continue;
    }

    const change = parseChangeLine(line);
    if (change) {
      changes.push(change);
      continue;
    }

    (currentSection?.lines ?? preamble).push(line);
  }

  return {
    changes,
    fullChangelog,
    normalizedMarkdown,
    preamble: trimBlankLines(preamble),
    sections: sections
      .map((section) => ({
        ...section,
        lines: trimBlankLines(section.lines),
      }))
      .filter((section) => section.lines.length > 0),
  };
};

const groupChanges = (changes, categoryDefinitions = categories) =>
  categoryDefinitions.flatMap((category) => {
    const items = changes.filter(
      (change) => change.categoryKey === category.key,
    );
    return items.length > 0 ? [{ ...category, items }] : [];
  });

const escapeNotificationTitle = (title) =>
  [...title]
    .map((character) =>
      markdownSpecialCharacters.has(character) ? `\\${character}` : character,
    )
    .join('');

const notificationItemLine = (change) =>
  `- ${escapeNotificationTitle(change.title)} · [PR #${change.pr}](${change.url})`;

export const buildReleaseNotification = (markdown) => {
  const { changes } = parseReleaseNotes(markdown);
  const notificationCategories = categories.filter((category) =>
    notificationCategoryKeys.has(category.key),
  );
  const groups = groupChanges(
    changes.filter((change) => change.scope !== 'site'),
    notificationCategories,
  ).map((group) => ({
    key: group.key,
    label: group.title,
    items: group.items.map(({ pr, title, url }) => ({ pr, title, url })),
  }));

  return {
    schemaVersion: 1,
    changeCount: groups.reduce((count, group) => count + group.items.length, 0),
    categoryCount: groups.length,
    markdown: groups
      .map(
        (group) =>
          `**${group.label}**\n${group.items
            .map(notificationItemLine)
            .join('\n')}`,
      )
      .join('\n\n'),
    groups,
  };
};

export const formatReleaseNotes = (markdown) => {
  const parsedNotes = parseReleaseNotes(markdown);
  if (parsedNotes.changes.length === 0) {
    return parsedNotes.normalizedMarkdown;
  }

  const orderedSections = groupChanges(parsedNotes.changes).map((group) => ({
    lines: group.items.map((item) => item.line),
    title: group.title,
  }));
  const remainingSections = [];
  for (const section of parsedNotes.sections) {
    const matchingOrderedSection = orderedSections.find(
      (orderedSection) => orderedSection.title === section.title,
    );
    if (matchingOrderedSection) {
      matchingOrderedSection.lines.push(...section.lines);
    } else {
      remainingSections.push(section);
    }
  }

  return [
    parsedNotes.preamble.join('\n'),
    ...orderedSections.map(
      (section) => `## ${section.title}\n${section.lines.join('\n')}`,
    ),
    ...remainingSections.map(
      (section) =>
        `${section.marker} ${section.title}\n${section.lines.join('\n')}`,
    ),
    parsedNotes.fullChangelog.join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
};

const isCommandLineInvocation =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCommandLineInvocation) {
  const unknownArguments = process.argv
    .slice(2)
    .filter((argument) => argument !== '--notification-json');
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(', ')}`);
  }

  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const output = process.argv.includes('--notification-json')
    ? JSON.stringify(buildReleaseNotification(input), null, 2)
    : formatReleaseNotes(input);
  process.stdout.write(`${output}\n`);
}
