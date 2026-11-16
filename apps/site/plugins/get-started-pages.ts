import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AdditionalPage, RspressPlugin } from '@rspress/core';
import {
  type CompleteSelection,
  type Lang,
  allPaths,
  getStartedRoute,
  pathDescription,
  pathLabels,
  pathTitle,
  sceneLabel,
  zhJoin,
} from '../theme/components/get-started-plan';

const docsRoot = nodePath.join(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  '../docs',
);

// The interactive page points to its questions. The Markdown output has no
// questions, so it only points to the list of all paths.
const intro = {
  en: (path: CompleteSelection, interactive: boolean) => {
    const labels = pathLabels.en;
    const change = interactive ? 'change the answers below or see' : 'see';
    return `These are the setup steps for Midscene on **${labels.platforms[path.platform]}** with **${sceneLabel('en', path)}** and a **${labels.models[path.model]}**. To choose another combination, ${change} [all setup paths](${getStartedRoute('en')}#all-setup-paths).`;
  },
  zh: (path: CompleteSelection, interactive: boolean) => {
    const labels = pathLabels.zh;
    const change = interactive ? '修改下方的选择，或查看' : '查看';
    return `${zhJoin(
      '本页是在',
      `**${labels.platforms[path.platform]}**`,
      '上使用',
      `**${sceneLabel('zh', path)}**`,
      '、通过',
      `**${labels.models[path.model]}**`,
      '接入模型的配置步骤。',
    )}如需其他组合，请${change}[全部配置路径](${getStartedRoute('zh')}#all-setup-paths)。`;
  },
} satisfies Record<
  Lang,
  (path: CompleteSelection, interactive: boolean) => string
>;

const backToTop = {
  en: 'Want to try another platform or way to use Midscene? [Back to top](#get-started) to change your selections.',
  zh: '想尝试其他平台或使用方式？[回到顶部](#get-started)修改选择。',
} satisfies Record<Lang, string>;

// YAML double-quoted string.
const quote = (value: string) => JSON.stringify(value);

export function getStartedPageContent(lang: Lang, path: CompleteSelection) {
  const steps = `${docsRoot}/${lang}/common/get-started-steps.mdx`;
  return `---
title: ${quote(pathTitle(lang, path))}
description: ${quote(pathDescription(lang, path))}
---

import {
  GetStarted,
  GetStartedHtmlOnly,
  GetStartedMarkdownOnly,
} from '@theme';
import Steps from ${quote(steps)};

# ${pathTitle(lang, path)} {#get-started}

<GetStartedHtmlOnly>

${intro[lang](path, true)}

</GetStartedHtmlOnly>

<GetStartedMarkdownOnly>

${intro[lang](path, false)}

</GetStartedMarkdownOnly>

<GetStarted lang="${lang}" path={${JSON.stringify(path)}}>

<Steps />

</GetStarted>

<GetStartedHtmlOnly>

${backToTop[lang]}

</GetStartedHtmlOnly>
`;
}

// One page per setup path and language, so each page's static HTML and
// Markdown contain exactly one path.
export function getStartedPages(): AdditionalPage[] {
  return (['en', 'zh'] as const).flatMap((lang) =>
    allPaths.map((path) => ({
      routePath: getStartedRoute(lang, path),
      content: getStartedPageContent(lang, path),
    })),
  );
}

export function pluginGetStartedPages(): RspressPlugin {
  return {
    name: 'midscene-get-started-pages',
    addPages: () => getStartedPages(),
  };
}
