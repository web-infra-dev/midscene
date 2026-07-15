import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rspress/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { pluginClientRedirects } from '@rspress/plugin-client-redirects';
import { pluginLlms } from '@rspress/plugin-llms';
import { pluginSitemap } from '@rspress/plugin-sitemap';
import { getGitHubStars } from './scripts/github-stars';

const SITE_URL = 'https://midscenejs.com';
const FAVICON_URL = `${SITE_URL}/favicon.png`;
const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;

const SEARCH_IDENTITY_JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Midscene.js',
      url: `${SITE_URL}/`,
      logo: {
        '@type': 'ImageObject',
        url: FAVICON_URL,
        width: 600,
        height: 600,
      },
      image: OG_IMAGE_URL,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Midscene.js',
      url: `${SITE_URL}/`,
      publisher: {
        '@id': `${SITE_URL}/#organization`,
      },
    },
  ],
});

export default defineConfig(async () => {
  const githubStars = await getGitHubStars({
    strict: process.env.MIDSCENE_SITE_BUILD === 'true',
    token: process.env.GITHUB_TOKEN,
  });
  return {
    root: path.join(__dirname, 'docs'),
    title: 'Midscene - Vision-Driven UI Automation',
    description: 'AI-powered, vision-driven UI automation for every platform.',
    icon: '/favicon.png',
    logo: {
      light: '/midscene_with_text_light.png',
      dark: '/midscene_with_text_dark.png',
    },
    head: [
      [
        'link',
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '600x600',
          href: FAVICON_URL,
        },
      ],
      [
        'link',
        {
          rel: 'apple-touch-icon',
          href: FAVICON_URL,
        },
      ],
      // Open Graph
      [
        'meta',
        {
          property: 'og:image',
          content: OG_IMAGE_URL,
        },
      ],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { property: 'og:image:alt', content: 'Midscene.js logo' }],
      // Twitter Card
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      [
        'meta',
        {
          name: 'twitter:image',
          content: OG_IMAGE_URL,
        },
      ],
      ['meta', { name: 'twitter:image:alt', content: 'Midscene.js logo' }],
      // Prevent Bing from selecting arbitrary homepage images as search previews.
      ['meta', { name: 'bingbot', content: 'max-image-preview:none' }],
      `<script type="application/ld+json">${SEARCH_IDENTITY_JSON_LD}</script>`,
    ],
    markdown: {
      link: {
        checkDeadLinks: true,
      },
    },
    mediumZoom: {
      selector: '.rspress-doc img:not(.no-zoom)',
    },
    themeConfig: {
      lastUpdated: true,
      llmsUI: {
        placement: 'outline',
      },
      socialLinks: [
        {
          icon: 'github',
          mode: 'link',
          content: 'https://github.com/web-infra-dev/midscene',
        },
        {
          icon: 'discord',
          mode: 'link',
          content: 'https://discord.gg/2JyBHxszE4',
        },
        {
          icon: 'x',
          mode: 'link',
          content: 'https://x.com/midscene_ai',
        },
        {
          icon: 'lark',
          mode: 'link',
          content:
            'https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=693v0991-a6bb-4b44-b2e1-365ca0d199ba',
        },
      ],
      editLink: {
        docRepoBaseUrl:
          'https://github.com/web-infra-dev/midscene/tree/main/apps/site/docs',
      },
      nav: [
        {
          text: 'Versions',
          items: [
            {
              text: 'Changelog',
              link: 'https://midscenejs.com/changelog',
            },
            {
              text: 'Midscene.js v0.x',
              link: 'https://v0.midscenejs.com',
            },
            {
              text: 'Midscene.js v1.x',
              link: 'https://midscenejs.com',
            },
          ],
        },
      ],
      sidebar: {
        '/': [
          {
            sectionHeaderText: 'Introduction',
          },
          {
            text: 'Introduction',
            link: '/introduction',
          },
          {
            text: 'The Basics',
            link: '/basics',
          },
          {
            text: 'Model strategy',
            link: '/model-strategy',
          },
          {
            text: 'Showcases',
            link: '/showcases',
          },
          {
            sectionHeaderText: 'Getting Started',
          },
          {
            text: 'Quick start',
            link: '/quick-start',
          },
          {
            text: 'Supported models & setup',
            link: '/model-common-config',
          },
          {
            text: 'Control any platform with Skills',
            link: '/skills',
          },
          {
            sectionHeaderText: 'Web browser',
          },
          {
            text: 'Integrate with Playwright',
            link: '/integrate-with-playwright',
          },
          {
            text: 'Integrate with Puppeteer',
            link: '/integrate-with-puppeteer',
          },
          {
            text: 'Bridge to the desktop Chrome',
            link: '/bridge-mode',
          },
          {
            sectionHeaderText: 'More platforms',
          },
          {
            text: 'Platform overview',
            link: '/platforms/',
          },
          {
            text: 'Android',
            link: '/platforms/android',
          },
          {
            text: 'iOS',
            link: '/platforms/ios',
          },
          {
            text: 'HarmonyOS',
            link: '/platforms/harmonyos',
          },
          {
            text: 'Desktop',
            link: '/platforms/desktop',
          },
          {
            sectionHeaderText: 'Yaml test runner',
          },
          {
            text: 'Overview',
            link: '/yaml-test-runner-overview',
          },
          {
            text: 'Write and run YAML test cases',
            link: '/yaml-test-cases',
          },
          {
            text: 'Extend and maintain the YAML test runner',
            link: '/extend-yaml-test-runner',
          },
          {
            sectionHeaderText: 'Yaml automation (legacy)',
          },
          {
            text: 'YAML script runner',
            link: '/yaml-script-runner',
          },
          {
            text: 'Workflow in YAML format',
            link: '/automate-with-scripts-in-yaml',
          },
          {
            sectionHeaderText: 'Reference',
          },
          {
            text: 'API reference',
            link: '/reference/',
          },
          {
            text: 'Model configuration',
            link: '/model-config',
          },
          {
            sectionHeaderText: 'Advanced guides',
          },
          {
            text: 'Model debugging & observability',
            link: '/model-debugging-observability',
          },
          {
            text: 'Process report files',
            link: '/consume-report-file',
          },
          {
            text: 'Write BDD scripts with Gherkin',
            link: '/advanced/bdd-style-scripts-with-gherkin',
          },
          {
            text: 'Integrate with any interface',
            link: '/integrate-with-any-interface',
          },
          {
            text: 'Cache AI plans & DOM locators',
            link: '/caching',
          },
          {
            sectionHeaderText: 'Resources',
          },
          {
            text: 'FAQ',
            link: '/faq',
          },
          {
            text: 'AndroidWorld Benchmark Report',
            link: '/android-world-benchmark-report',
          },
          {
            text: 'MobileWorld Benchmark Report',
            link: '/mobile-world-benchmark-report',
          },
          {
            text: 'Changelog',
            link: '/changelog',
          },
          {
            text: 'Awesome Midscene',
            link: '/awesome-midscene',
          },
          {
            text: 'Data privacy',
            link: '/data-privacy',
          },
        ],
        '/zh': [
          {
            sectionHeaderText: '介绍',
          },
          {
            text: '介绍',
            link: '/zh/introduction',
          },
          {
            text: '基本概念',
            link: '/zh/basics',
          },
          {
            text: '模型策略',
            link: '/zh/model-strategy',
          },
          {
            text: '案例展示',
            link: '/zh/showcases',
          },
          {
            sectionHeaderText: '开始使用',
          },
          {
            text: '快速开始',
            link: '/zh/quick-start',
          },
          {
            text: '支持的模型与配置',
            link: '/zh/model-common-config',
          },
          {
            text: '使用 Skills 控制任意平台',
            link: '/zh/skills',
          },
          {
            sectionHeaderText: 'Web 浏览器',
          },
          {
            text: '集成到 Playwright',
            link: '/zh/integrate-with-playwright',
          },
          {
            text: '集成到 Puppeteer',
            link: '/zh/integrate-with-puppeteer',
          },
          {
            text: '桥接到桌面 Chrome',
            link: '/zh/bridge-mode',
          },
          {
            sectionHeaderText: '更多平台',
          },
          {
            text: '平台概览',
            link: '/zh/platforms/',
          },
          {
            text: 'Android',
            link: '/zh/platforms/android',
          },
          {
            text: 'iOS',
            link: '/zh/platforms/ios',
          },
          {
            text: 'HarmonyOS',
            link: '/zh/platforms/harmonyos',
          },
          {
            text: '桌面端',
            link: '/zh/platforms/desktop',
          },
          {
            sectionHeaderText: 'Yaml 测试运行器',
          },
          {
            text: '概览',
            link: '/zh/yaml-test-runner-overview',
          },
          {
            text: '编写和运行 YAML 测试用例',
            link: '/zh/yaml-test-cases',
          },
          {
            text: '扩展和维护 YAML 测试运行器',
            link: '/zh/extend-yaml-test-runner',
          },
          {
            sectionHeaderText: 'Yaml automation (legacy)',
          },
          {
            text: 'YAML 脚本运行器',
            link: '/zh/yaml-script-runner',
          },
          {
            text: 'YAML 格式的工作流',
            link: '/zh/automate-with-scripts-in-yaml',
          },
          {
            sectionHeaderText: '参考文档',
          },
          {
            text: 'API 参考',
            link: '/zh/reference/',
          },
          {
            text: '模型配置',
            link: '/zh/model-config',
          },
          {
            sectionHeaderText: '进阶指南',
          },
          {
            text: '模型调试与可观测性',
            link: '/zh/model-debugging-observability',
          },
          {
            text: '处理报告文件',
            link: '/zh/consume-report-file',
          },
          {
            text: '使用 Gherkin 编写 BDD 脚本',
            link: '/zh/advanced/bdd-style-scripts-with-gherkin',
          },
          {
            text: '与任意界面集成',
            link: '/zh/integrate-with-any-interface',
          },
          {
            text: '缓存 AI 规划与 DOM 定位',
            link: '/zh/caching',
          },
          {
            sectionHeaderText: '资源',
          },
          {
            text: '常见问题 FAQ',
            link: '/zh/faq',
          },
          {
            text: 'AndroidWorld Benchmark 测试报告',
            link: '/zh/android-world-benchmark-report',
          },
          {
            text: 'MobileWorld Benchmark 测试报告',
            link: '/zh/mobile-world-benchmark-report',
          },
          {
            text: '更新日志',
            link: '/zh/changelog',
          },
          {
            text: 'Awesome Midscene',
            link: '/zh/awesome-midscene',
          },
          {
            text: '数据隐私',
            link: '/zh/data-privacy',
          },
        ],
      },
    },
    globalStyles: path.join(__dirname, 'styles/index.css'),
    locales: [
      {
        lang: 'en',
        label: 'English',
        title: 'Midscene.js - (AI UI Automation, AI Testing)',
        description:
          'Midscene.js - (AI driven UI automation framework, Computer Use, Browser Use, Android Use)',
      },
      {
        lang: 'zh',
        label: '简体中文',
        title: 'Midscene.js - (AI UI 自动化，AI 测试)',
        description:
          'Midscene.js - (AI 驱动的 UI 自动化框架，Computer Use, Browser Use, Android Use)',
      },
    ],
    builderConfig: {
      performance: {
        buildCache: false,
      },
      source: {
        preEntry: ['./theme/tailwind.css'],
        define: {
          __MIDSCENE_GITHUB_STARS__: JSON.stringify(githubStars),
        },
      },
      html: {
        tags: [
          {
            tag: 'script',
            attrs: {
              type: 'text/javascript',
            },
            children: `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "rg8ztmkti8");`,
          },
        ],
        meta: {
          'google-site-verification':
            'knm1l2oVU9IkHaYjq9q-FnyiEMVkt1b6i2El54Hphdw',
        },
      },
    },
    lang: 'en',
    plugins: [
      pluginLlms([
        {
          llmsTxt: {
            name: 'llms.txt',
          },
          llmsFullTxt: {
            name: 'llms-full.txt',
          },
          include: ({ page }) => page.lang === 'en',
        },
        {
          llmsTxt: {
            name: 'zh/llms.txt',
          },
          llmsFullTxt: {
            name: 'zh/llms-full.txt',
          },
          include: ({ page }) => page.lang === 'zh',
        },
      ]),
      pluginSitemap({
        siteUrl: 'https://midscenejs.com',
      }),
      pluginClientRedirects({
        redirects: [
          {
            from: '^/android-(?:introduction|getting-started)(?:\\.html)?/?$',
            to: '/platforms/android',
          },
          {
            from: '^/ios-(?:introduction|getting-started)(?:\\.html)?/?$',
            to: '/platforms/ios',
          },
          {
            from: '^/harmony-(?:introduction|getting-started)(?:\\.html)?/?$',
            to: '/platforms/harmonyos',
          },
          {
            from: '^/computer-(?:introduction|getting-started)(?:\\.html)?/?$',
            to: '/platforms/desktop',
          },
          {
            from: '^/(?:android-api-reference|reference/android)(?:\\.html)?/?$',
            to: '/reference/#android',
          },
          {
            from: '^/(?:ios-api-reference|reference/ios)(?:\\.html)?/?$',
            to: '/reference/#ios',
          },
          {
            from: '^/(?:harmony-api-reference|reference/harmonyos)(?:\\.html)?/?$',
            to: '/reference/#harmonyos',
          },
          {
            from: '^/(?:computer-api-reference|reference/desktop)(?:\\.html)?/?$',
            to: '/reference/#desktop',
          },
          {
            from: '^/(?:web-api-reference|reference/web)(?:\\.html)?/?$',
            to: '/reference/#web',
          },
          {
            from: '^/(?:api|reference/common)(?:\\.html)?/?$',
            to: '/reference/#common',
          },
          {
            from: '^/zh/android-(?:introduction|getting-started)(?:\\.html)?/?$',
            to: '/zh/platforms/android',
          },
          {
            from: '^/zh/ios-(?:introduction|getting-started)(?:\\.html)?/?$',
            to: '/zh/platforms/ios',
          },
          {
            from: '^/zh/harmony-(?:introduction|getting-started)(?:\\.html)?/?$',
            to: '/zh/platforms/harmonyos',
          },
          {
            from: '^/zh/computer-(?:introduction|getting-started)(?:\\.html)?/?$',
            to: '/zh/platforms/desktop',
          },
          {
            from: '^/zh/(?:android-api-reference|reference/android)(?:\\.html)?/?$',
            to: '/zh/reference/#android',
          },
          {
            from: '^/zh/(?:ios-api-reference|reference/ios)(?:\\.html)?/?$',
            to: '/zh/reference/#ios',
          },
          {
            from: '^/zh/(?:harmony-api-reference|reference/harmonyos)(?:\\.html)?/?$',
            to: '/zh/reference/#harmonyos',
          },
          {
            from: '^/zh/(?:computer-api-reference|reference/desktop)(?:\\.html)?/?$',
            to: '/zh/reference/#desktop',
          },
          {
            from: '^/zh/(?:web-api-reference|reference/web)(?:\\.html)?/?$',
            to: '/zh/reference/#web',
          },
          {
            from: '^/zh/(?:api|reference/common)(?:\\.html)?/?$',
            to: '/zh/reference/#common',
          },
          {
            from: '^/integrate-with-android(?:\\.html)?/?$',
            to: '/platforms/android',
          },
          {
            from: '^/integrate-with-ios(?:\\.html)?/?$',
            to: '/platforms/ios',
          },
          {
            from: '^/integrate-with-harmony(?:\\.html)?/?$',
            to: '/platforms/harmonyos',
          },
          {
            from: '^/android-playground(?:\\.html)?/?$',
            to: '/platforms/android',
          },
          {
            from: '^/ios-playground(?:\\.html)?/?$',
            to: '/platforms/ios',
          },
          {
            from: '^/choose-a-model(?:\\.html)?/?$',
            to: '/model-common-config',
          },
          {
            from: '^/model-provider(?:\\.html)?/?$',
            to: '/model-common-config.html',
          },
          {
            from: '^/blog-use-javascript-to-optimize-ai-automation-code(?:\\.html)?/?$',
            to: '/basics#javascript-orchestration',
          },
          {
            from: '^/use-javascript-to-optimize-ai-automation-code(?:\\.html)?/?$',
            to: '/basics#javascript-orchestration',
          },
          {
            from: '^/bridge-mode-by-chrome-extension(?:\\.html)?/?$',
            to: '/bridge-mode',
          },
          {
            from: '^/web-mcp(?:\\.html)?/?$',
            to: '/skills',
          },
          {
            from: '^/mcp-android(?:\\.html)?/?$',
            to: '/skills',
          },
          {
            from: '^/blog-support-android-automation(?:\\.html)?/?$',
            to: '/platforms/android',
          },
          {
            from: '^/blog-support-ios-automation(?:\\.html)?/?$',
            to: '/platforms/ios',
          },
          {
            from: '^/quick-experience(?:\\.html)?/?$',
            to: '/quick-start#chrome-extension',
          },
          {
            from: '^/quick-experience-with-android(?:\\.html)?/?$',
            to: '/platforms/android',
          },
          {
            from: '^/quick-experience-with-ios(?:\\.html)?/?$',
            to: '/platforms/ios',
          },
          {
            from: '^/zh/web-mcp(?:\\.html)?/?$',
            to: '/zh/skills',
          },
          {
            from: '^/zh/mcp-android(?:\\.html)?/?$',
            to: '/zh/skills',
          },
          {
            from: '^/zh/integrate-with-android(?:\\.html)?/?$',
            to: '/zh/platforms/android',
          },
          {
            from: '^/zh/integrate-with-ios(?:\\.html)?/?$',
            to: '/zh/platforms/ios',
          },
          {
            from: '^/zh/integrate-with-harmony(?:\\.html)?/?$',
            to: '/zh/platforms/harmonyos',
          },
          {
            from: '^/zh/blog-support-android-automation(?:\\.html)?/?$',
            to: '/zh/platforms/android',
          },
          {
            from: '^/zh/blog-support-ios-automation(?:\\.html)?/?$',
            to: '/zh/platforms/ios',
          },
          {
            from: '^/zh/quick-experience(?:\\.html)?/?$',
            to: '/zh/quick-start#chrome-extension',
          },
          {
            from: '^/zh/quick-experience-with-android(?:\\.html)?/?$',
            to: '/zh/platforms/android',
          },
          {
            from: '^/zh/quick-experience-with-ios(?:\\.html)?/?$',
            to: '/zh/platforms/ios',
          },
          {
            from: '^/zh/choose-a-model(?:\\.html)?/?$',
            to: '/zh/model-common-config',
          },
          {
            from: '^/zh/model-provider(?:\\.html)?/?$',
            to: '/zh/model-common-config.html',
          },
          {
            from: '^/zh/blog-use-javascript-to-optimize-ai-automation-code(?:\\.html)?/?$',
            to: '/zh/basics#javascript-orchestration',
          },
          {
            from: '^/zh/use-javascript-to-optimize-ai-automation-code(?:\\.html)?/?$',
            to: '/zh/basics#javascript-orchestration',
          },
          {
            from: '^/zh/bridge-mode-by-chrome-extension(?:\\.html)?/?$',
            to: '/zh/bridge-mode',
          },
          {
            from: '^/zh/android-playground(?:\\.html)?/?$',
            to: '/zh/platforms/android',
          },
          {
            from: '^/zh/ios-playground(?:\\.html)?/?$',
            to: '/zh/platforms/ios',
          },
          {
            from: '^/command-line-tools(?:\\.html)?/?$',
            to: '/yaml-script-runner',
          },
          {
            from: '^/zh/command-line-tools(?:\\.html)?/?$',
            to: '/zh/yaml-script-runner',
          },
        ],
      }),
    ],
  };
});
