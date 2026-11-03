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

const intro = {
  en: (path: CompleteSelection) => {
    const labels = pathLabels.en;
    return `These are the setup steps for Midscene on **${labels.platforms[path.platform]}** with **${sceneLabel('en', path)}** and a **${labels.models[path.model]}**. To choose another combination, change the answers below or see [all setup paths](${getStartedRoute('en')}#all-setup-paths).`;
  },
  zh: (path: CompleteSelection) => {
    const labels = pathLabels.zh;
    return `${zhJoin(
      '本页是在',
      `**${labels.platforms[path.platform]}**`,
      '上使用',
      `**${sceneLabel('zh', path)}**`,
      '、通过',
      `**${labels.models[path.model]}**`,
      '接入模型的配置步骤。',
    )}如需其他组合，请修改下方的选择，或查看[全部配置路径](${getStartedRoute('zh')}#all-setup-paths)。`;
  },
} satisfies Record<Lang, (path: CompleteSelection) => string>;

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

import { GetStarted } from '@theme';
import Steps from ${quote(steps)};

# ${pathTitle(lang, path)} {#get-started}

${intro[lang](path)}

<GetStarted lang="${lang}" path={${JSON.stringify(path)}}>

<Steps />

</GetStarted>

${backToTop[lang]}
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
