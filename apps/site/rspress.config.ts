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
// Bump this version when browsers need to refresh their cached site icon.
const FAVICON_LINK_URL = `${FAVICON_URL}?v=20260929`;
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
    route: {
      cleanUrls: true,
    },
    title: 'Midscene.js - AI UI Automation and E2E Testing',
    description:
      'Bring AI vision to E2E testing with a newly designed test framework for web, mobile, and desktop apps.',
    icon: FAVICON_LINK_URL,
    logo: {
      light: '/images/brand/midscene_with_text_light.png',
      dark: '/images/brand/midscene_with_text_dark.png',
    },
    head: [
      [
        'link',
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '600x600',
          href: FAVICON_LINK_URL,
        },
      ],
      [
        'link',
        {
          rel: 'apple-touch-icon',
          href: FAVICON_LINK_URL,
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
            sectionHeaderText: 'Discover Midscene',
          },
          {
            text: 'Introduction',
            link: '/',
          },
          {
            text: 'The basics',
            link: '/basics',
          },
          {
            text: 'Showcases',
            link: '/showcases',
          },
          {
            sectionHeaderText: 'Getting started',
          },
          {
            text: 'Try the GUI Agent',
            link: '/quick-start',
          },
          {
            text: 'Start with Midscene Test',
            link: '/midscene-test/use',
          },
          {
            text: 'Control any platform with Skills',
            link: '/skills',
          },
          {
            sectionHeaderText: 'Models',
          },
          {
            text: 'Model selection guide',
            link: '/model-selection',
          },
          {
            text: 'Use a model API Key',
            link: '/model-api-setup',
          },
          {
            text: 'Use a ChatGPT subscription',
            link: '/chatgpt-subscription',
          },
          {
            text: 'Advanced configuration & debugging',
            link: '/model-config',
          },
          {
            sectionHeaderText: 'Platform integrations',
          },
          {
            text: 'Platform overview',
            link: '/platforms/',
          },
          {
            text: 'Web',
            collapsible: true,
            collapsed: true,
            items: [
              {
                text: 'Playwright',
                link: '/integrate-with-playwright',
              },
              {
                text: 'Puppeteer',
                link: '/integrate-with-puppeteer',
              },
              {
                text: 'Chrome Bridge',
                link: '/bridge-mode',
              },
            ],
          },
          {
            text: 'Mobile',
            collapsible: true,
            collapsed: true,
            items: [
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
            ],
          },
          {
            text: 'Desktop',
            link: '/platforms/desktop',
          },
          {
            sectionHeaderText: 'Midscene Test',
          },
          {
            text: 'Framework overview',
            link: '/midscene-test/overview',
          },
          {
            text: 'Create a test project',
            link: '/midscene-test/use',
          },
          {
            text: 'Write YAML cases',
            link: '/midscene-test/writing',
          },
          {
            text: 'Run tests',
            link: '/midscene-test/running',
          },
          {
            text: 'Configure and extend',
            collapsible: true,
            collapsed: true,
            items: [
              {
                text: 'Configure test projects',
                link: '/midscene-test/configuration',
              },
              {
                text: 'Develop custom Nodes',
                link: '/midscene-test/extend',
              },
              {
                text: 'Lifecycle and concurrency',
                link: '/midscene-test/execution',
              },
            ],
          },
          {
            sectionHeaderText: 'Legacy YAML automation',
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
            text: 'Migrate to Midscene Test',
            link: '/migrate-to-midscene-test',
          },
          {
            sectionHeaderText: 'Reference',
          },
          {
            text: 'GUI Agent API',
            link: '/reference/',
          },
          {
            sectionHeaderText: 'Advanced guides',
          },
          {
            text: 'Provide application knowledge to a GUI Agent',
            link: '/provide-application-knowledge-to-gui-agent',
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
          {
            sectionHeaderText: 'Benchmark',
          },
          {
            text: 'AndroidWorld benchmark',
            link: '/android-world-benchmark-report',
          },
          {
            text: 'MobileWorld benchmark',
            link: '/mobile-world-benchmark-report',
          },
          {
            text: 'AppControlBench benchmark',
            link: '/app-control-bench-report',
          },
        ],
        '/zh': [
          {
            sectionHeaderText: '了解 Midscene',
          },
          {
            text: '介绍',
            link: '/zh/',
          },
          {
            text: '基本概念',
            link: '/zh/basics',
          },
          {
            text: '案例展示',
            link: '/zh/showcases',
          },
          {
            sectionHeaderText: '开始使用',
          },
          {
            text: '快速体验 GUI Agent',
            link: '/zh/quick-start',
          },
          {
            text: '创建 Midscene Test E2E 项目',
            link: '/zh/midscene-test/use',
          },
          {
            text: '使用 Skills 控制任意平台',
            link: '/zh/skills',
          },
          {
            sectionHeaderText: '模型',
          },
          {
            text: '模型选择指南',
            link: '/zh/model-selection',
          },
          {
            text: '使用模型 API Key',
            link: '/zh/model-api-setup',
          },
          {
            text: '使用 ChatGPT 订阅',
            link: '/zh/chatgpt-subscription',
          },
          {
            text: '高级配置与调试',
            link: '/zh/model-config',
          },
          {
            sectionHeaderText: '平台集成',
          },
          {
            text: '平台概览',
            link: '/zh/platforms/',
          },
          {
            text: 'Web',
            collapsible: true,
            collapsed: true,
            items: [
              {
                text: 'Playwright',
                link: '/zh/integrate-with-playwright',
              },
              {
                text: 'Puppeteer',
                link: '/zh/integrate-with-puppeteer',
              },
              {
                text: 'Chrome Bridge',
                link: '/zh/bridge-mode',
              },
            ],
          },
          {
            text: '移动端',
            collapsible: true,
            collapsed: true,
            items: [
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
            ],
          },
          {
            text: '桌面端',
            link: '/zh/platforms/desktop',
          },
          {
            sectionHeaderText: 'Midscene Test',
          },
          {
            text: '框架概览',
            link: '/zh/midscene-test/overview',
          },
          {
            text: '创建测试项目',
            link: '/zh/midscene-test/use',
          },
          {
            text: '编写 YAML 用例',
            link: '/zh/midscene-test/writing',
          },
          {
            text: '运行测试',
            link: '/zh/midscene-test/running',
          },
          {
            text: '配置与扩展',
            collapsible: true,
            collapsed: true,
            items: [
              {
                text: '配置测试工程',
                link: '/zh/midscene-test/configuration',
              },
              {
                text: '开发自定义 Node',
                link: '/zh/midscene-test/extend',
              },
              {
                text: '生命周期与并发',
                link: '/zh/midscene-test/execution',
              },
            ],
          },
          {
            sectionHeaderText: '旧版 YAML 自动化',
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
            text: '迁移到 Midscene Test',
            link: '/zh/migrate-to-midscene-test',
          },
          {
            sectionHeaderText: '参考文档',
          },
          {
            text: 'GUI Agent API',
            link: '/zh/reference/',
          },
          {
            sectionHeaderText: '进阶指南',
          },
          {
            text: '为 GUI Agent 补充应用知识',
            link: '/zh/provide-application-knowledge-to-gui-agent',
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
          {
            sectionHeaderText: 'Benchmark',
          },
          {
            text: 'AndroidWorld benchmark',
            link: '/zh/android-world-benchmark-report',
          },
          {
            text: 'MobileWorld benchmark',
            link: '/zh/mobile-world-benchmark-report',
          },
          {
            text: 'AppControlBench benchmark',
            link: '/zh/app-control-bench-report',
          },
        ],
      },
    },
    globalStyles: path.join(__dirname, 'styles/index.css'),
    locales: [
      {
        lang: 'en',
        label: 'English',
        title: 'Midscene.js - AI UI Automation and E2E Testing',
        description:
          'Bring AI vision to E2E testing with a newly designed test framework for web, mobile, and desktop apps.',
      },
      {
        lang: 'zh',
        label: '简体中文',
        title: 'Midscene.js - AI UI 自动化与 E2E 测试',
        description:
          '将 AI 视觉引入 E2E 测试，配套全新设计的测试框架，支持 Web、移动端和桌面应用。',
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
          { from: '^/zh$', to: '/zh/' },
          ...['', '/zh'].flatMap((locale) => [
            {
              from: `^${locale}/(?:introduction(?:\\.html)?/?|index\\.html)$`,
              to: `${locale}/`,
            },
            {
              from: `^${locale}/reference\\.html/?$`,
              to: `${locale}/reference/`,
            },
            ...[
              ['reporting', 'consume-report-file'],
              ['model-strategy', 'model-selection'],
              ['model-common-config', 'model-api-setup'],
              [
                'model-debugging-observability',
                'model-config#verify-model-connectivity',
              ],
              ['cli', 'yaml-script-runner'],
              [
                'blog-programming-practice-using-structured-api',
                'basics#javascript-orchestration',
              ],
            ].map(([previous, current]) => ({
              from: `^${locale}/${previous}(?:\\.html)?/?$`,
              to: `${locale}/${current}`,
            })),
          ]),
          ...['', '/zh'].flatMap((locale) =>
            [
              ['test-runner-overview', 'overview'],
              ['extend-test-runner', 'extend'],
              ['use-test-runner', 'use'],
            ].map(([previous, current]) => ({
              from: `^${locale}/${previous}(?:\\.html)?/?$`,
              to: `${locale}/midscene-test/${current}`,
            })),
          ),
          {
            from: '^/android-(?:introduction|getting-started)(?:\\.html)?/?$',
            to: '/platforms/android',
          },
          {
            from: '^/android-integration(?:\\.html)?/?$',
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
            to: '/model-selection',
          },
          {
            from: '^/api-reference(?:\\.html)?/?$',
            to: '/reference/',
          },
          {
            from: '^/report(?:\\.html)?/?$',
            to: '/consume-report-file',
          },
          {
            from: '^/benchmark(?:\\.html)?/?$',
            to: '/',
          },
          {
            from: '^/integrate-with-yaml(?:\\.html)?/?$',
            to: '/automate-with-scripts-in-yaml',
          },
          {
            from: '^/model-provider(?:\\.html)?/?$',
            to: '/model-api-setup',
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
            from: '^/zh/batch-yaml(?:\\.html)?/?$',
            to: '/zh/yaml-script-runner',
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
            to: '/zh/model-selection',
          },
          {
            from: '^/zh/model-provider(?:\\.html)?/?$',
            to: '/zh/model-api-setup',
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
