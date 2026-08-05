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

const conventionalTitlePattern =
  /^(?<type>[A-Za-z]+)(?:\([^)]*\))?(?<breaking>!)?:/;
const changeTitlePattern =
  /^[*-] (?<title>.+?) by @[^ ]+ in https:\/\/github\.com\/[^ ]+\/pull\/\d+$/;
const changeLinePattern = /^[*-] /;

const categoryForLine = (line) => {
  const title =
    line.match(changeTitlePattern)?.groups?.title ??
    line.replace(changeLinePattern, '');
  const conventionalTitle = title?.match(conventionalTitlePattern)?.groups;

  if (!conventionalTitle) {
    return 'other';
  }
  if (conventionalTitle.breaking) {
    return 'breaking';
  }

  const type = conventionalTitle.type.toLowerCase();
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

export const formatReleaseNotes = (markdown) => {
  const normalizedMarkdown = markdown.replaceAll('\r', '').trim();
  const lines = normalizedMarkdown.split('\n');
  const changeLines = lines.filter((line) => changeLinePattern.test(line));

  if (changeLines.length === 0) {
    return normalizedMarkdown;
  }

  const groupedChanges = new Map(
    categories.map((category) => [category.key, []]),
  );
  for (const line of changeLines) {
    groupedChanges.get(categoryForLine(line)).push(line);
  }

  const sections = categories.flatMap((category) => {
    const changes = groupedChanges.get(category.key);
    return changes.length > 0
      ? [`## ${category.title}\n${changes.join('\n')}`]
      : [];
  });
  const comments = lines.filter((line) => /^<!--.*-->$/.test(line.trim()));
  const fullChangelog = lines.find((line) =>
    line.startsWith('**Full Changelog**:'),
  );

  return [...comments, ...sections, fullChangelog].filter(Boolean).join('\n\n');
};

const isCommandLineInvocation =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCommandLineInvocation) {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  process.stdout.write(`${formatReleaseNotes(input)}\n`);
}
