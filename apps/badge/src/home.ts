import { LOGO_96 } from './logo';
import { BADGE_ORIGIN } from './site';

export type HomeLanguage = 'zh' | 'en';

export function homeLanguage(request: Request): HomeLanguage {
  const explicit = new URL(request.url).searchParams.get('lang');
  if (explicit === 'zh' || explicit === 'en') return explicit;
  const languages = (request.headers.get('Accept-Language') ?? '')
    .split(',')
    .map((entry) => {
      const [language, quality] = entry.trim().split(';');
      return {
        language,
        quality: quality ? Number(quality.trim().replace(/^q=/, '')) : 1,
      };
    })
    .filter(
      ({ language, quality }) =>
        /^(zh|en)(-|$)/i.test(language) && quality > 0 && quality <= 1,
    )
    .sort((a, b) => b.quality - a.quality);
  if (languages.length) return /^zh/i.test(languages[0].language) ? 'zh' : 'en';
  if (
    !request.headers.get('Accept-Language') &&
    /\bzh(?:[-_]cn|[-_]tw|[-_]hk)?\b/i.test(
      request.headers.get('User-Agent') ?? '',
    )
  )
    return 'zh';
  return 'en';
}

const copy = {
  zh: {
    title: '用 Badge 在 Markdown 中展示 E2E 测试结果',
    intro:
      '用 SVG badge 展示 E2E 用例的通过情况。选择下方样式，填写通过、失败和跳过的用例数，再将 Markdown 复制到 README 或文档中。',
    previews: '效果预览',
    previewColumns: [
      {
        title: '默认版',
        detail:
          '只展示通过和失败数。不传 skipped 或设为 0 时，均使用这些样式。',
      },
      {
        title: '带 skipped',
        detail: '在相同的通过和失败数上增加 skipped=5，单独展示跳过数。',
      },
    ],
    staticTitle: '静态徽章',
    passedAndSkipped: '通过及跳过',
    parameters: '参数说明',
    parameter: '参数',
    rule: '规则',
    open: '打开 SVG',
    preview: '徽章预览',
    optional: '方括号表示可选参数，使用时不要保留。',
    counts: '必填，0–9999999 的整数，分别表示通过数和失败数。',
    skipped: '可选，0–9999999 的整数，默认 0；大于 0 时显示跳过数。',
    styles: '可选：flat（默认，20px）、large（28px）、card（双行，60px）。',
    themes: '可选：light（默认）或 dark，仅影响 card 样式。',
    source:
      '数字由 URL 提供，不会自动读取 CI 或报告。卡片总数为 pass + fail + skipped，通过率为 pass / (pass + fail)，不计跳过用例；没有已执行用例时显示 0%。跳过部分和零失败数显示为灰色。',
    cache: '无效参数返回 HTTP 400 和错误说明。SVG 缓存时间为 24 小时。',
    by: '静态的 E2E by Midscene.js 徽章，style 可选 flat（默认）或 large，Markdown 中链接到 Midscene.js 官网。',
    footer: '所有预览均由当前服务实时生成。',
    poweredBy: '由 {link} 提供：基于视觉的 AI UI 自动化工具。',
    language: '选择语言',
    names: [
      '单行',
      '大号单行',
      '卡片 · 浅色',
      '卡片 · 深色',
      '全部通过',
      '暂无测试',
      '全部跳过',
      'E2E by Midscene.js',
      'E2E by Midscene.js · 大号',
    ],
    details: [
      '默认样式 · 20px',
      '大号样式 · 28px',
      '浅色卡片 · 60px',
      '深色卡片 · 60px',
      '没有失败用例',
      '通过率显示为 0%',
      '跳过 5 个用例，没有已执行用例',
      '静态徽章 · 20px，无需填写数字',
      '静态徽章 · 28px，无需填写数字',
    ],
  },
  en: {
    title: 'Show E2E test results with a Markdown badge',
    intro:
      'Display the pass status of your E2E tests with an SVG badge. Pick a style below, enter your passed, failed, and skipped counts, then copy the Markdown into your README or docs.',
    previews: 'Live previews',
    previewColumns: [
      {
        title: 'Default',
        detail:
          'Show passed and failed counts only. Omit skipped or set it to 0 for these styles.',
      },
      {
        title: 'With skipped',
        detail:
          'Add skipped=5 to the same passed and failed counts to show skipped tests separately.',
      },
    ],
    staticTitle: 'Static badges',
    passedAndSkipped: 'Passed and skipped',
    parameters: 'Parameters',
    parameter: 'Parameter',
    rule: 'Rule',
    open: 'Open SVG',
    preview: 'badge preview',
    optional: 'Square brackets mark optional parameters; omit the brackets.',
    counts: 'Required integers from 0 to 9999999: passed and failed counts.',
    skipped:
      'Optional integer from 0 to 9999999, default 0; shown when greater than 0.',
    styles:
      'Optional: flat (default, 20px), large (28px), card (two lines, 60px).',
    themes: 'Optional: light (default) or dark; only affects card badges.',
    source:
      'Counts come from the URL, not CI or reports. Cards show the total (pass + fail + skipped) and pass rate (pass / (pass + fail), excluding skipped tests, or 0% when none ran). Skipped tests and zero failures appear grey.',
    cache:
      'Invalid parameters return HTTP 400 with an explanation. SVG responses are cached for 24 hours.',
    by: 'A static E2E by Midscene.js badge. style is flat (default) or large; the Markdown links to the Midscene.js website.',
    footer: 'All previews are rendered live by this service.',
    poweredBy: 'Powered by {link}, vision-driven UI automation with AI.',
    language: 'Choose language',
    names: [
      'Flat',
      'Large',
      'Card · Light',
      'Card · Dark',
      'All passed',
      'No tests',
      'All skipped',
      'E2E by Midscene.js',
      'E2E by Midscene.js · Large',
    ],
    details: [
      'Default style · 20px',
      'Large style · 28px',
      'Light card · 60px',
      'Dark card · 60px',
      'No failed tests',
      'Pass rate shown as 0%',
      '5 skipped tests, none executed',
      'Static badge · 20px, no counts',
      'Static badge · 28px, no counts',
    ],
  },
};
const SITE = 'https://midscenejs.com';
const examples = [
  { path: '/e2e?pass=42&fail=3', alt: 'Midscene Test' },
  { path: '/e2e?pass=42&fail=3&style=large', alt: 'Midscene Test' },
  {
    path: '/e2e?pass=42&fail=3&style=card&theme=light',
    alt: 'Midscene Test',
  },
  {
    path: '/e2e?pass=42&fail=3&style=card&theme=dark',
    alt: 'Midscene Test',
  },
  { path: '/e2e?pass=45&fail=0', alt: 'Midscene Test' },
  { path: '/e2e?pass=0&fail=0&style=card', alt: 'Midscene Test' },
  { path: '/e2e?pass=0&fail=0&skipped=5&style=card', alt: 'Midscene Test' },
  { path: '/by-midscene', alt: 'E2E by Midscene.js', link: SITE },
  { path: '/by-midscene?style=large', alt: 'E2E by Midscene.js', link: SITE },
];

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}

const STYLE = `
:root{--fg:#0a0a0a;--fg-2:#404040;--muted:#737373;--line:#ebebeb;--line-2:#d4d4d4;--soft:#fafafa;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Inter","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:var(--fg);font:15px/1.65 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
a:focus-visible{outline:2px solid var(--fg);outline-offset:3px;border-radius:4px}
.nav{position:sticky;top:0;z-index:1;background:rgba(255,255,255,.85);backdrop-filter:saturate(180%) blur(12px);-webkit-backdrop-filter:saturate(180%) blur(12px);border-bottom:1px solid var(--line)}
.nav-inner,main{max-width:1080px;margin:0 auto;padding:0 24px}
.nav-inner{height:56px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{text-decoration:none;display:flex;align-items:center;gap:10px;font-weight:600;font-size:14px;letter-spacing:-.01em}
.brand span{color:var(--muted);font-weight:400}
.logo{height:22px;width:auto;flex:none}
.languages{display:flex;gap:2px;padding:2px;border:1px solid var(--line);border-radius:8px;font-size:13px}
.languages a{padding:3px 10px;border-radius:6px;text-decoration:none;color:var(--muted);white-space:nowrap}
.languages a:hover{color:var(--fg)}
.languages a[aria-current=page]{background:var(--fg);color:#fff}
.hero{padding:48px 0 36px;border-bottom:1px solid var(--line)}
.hero .eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 14px;padding:3px 10px;border:1px solid var(--line);border-radius:999px;font:12px/1.5 var(--mono);color:var(--fg-2)}
.eyebrow i{width:6px;height:6px;border-radius:50%;background:var(--fg)}
h1{margin:0;max-width:920px;font-size:clamp(28px,4.6vw,44px);line-height:1.1;font-weight:700;letter-spacing:-.035em}
.hero h1+p{max-width:680px;margin:14px 0 0;font-size:16px;color:var(--muted)}
.hero .powered{margin:8px 0 0;font-size:14px;color:var(--fg-2)}
.powered a{font-weight:500;text-decoration:underline;text-decoration-color:var(--line-2);text-underline-offset:3px}
.powered a:hover{text-decoration-color:var(--fg)}
section{padding:36px 0;border-bottom:1px solid var(--line)}
.section-head{display:flex;align-items:baseline;gap:12px;margin-bottom:16px}
.section-head span{font:12px var(--mono);color:var(--muted)}
h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:12px}
article{min-width:0;border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden;transition:border-color .15s}
article:hover{border-color:var(--line-2)}
.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 16px}
.comparison-head,.comparison-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.comparison-row+.comparison-row{margin-top:12px}
.comparison-head h3,.static-title{margin:0;font-size:18px;font-weight:600}
.comparison-head .note{margin:6px 0 16px}
.variant-label{display:none}
.static-title{margin:32px 0 16px}
@media(max-width:760px){.comparison-head{display:none}.comparison-row{grid-template-columns:minmax(0,1fr)}.comparison-row+.comparison-row{margin-top:28px}.variant-label{display:block;margin-bottom:4px;font-size:12px;color:var(--muted)}}
h4{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em}
.card-head p{margin:2px 0 0;font-size:13px;color:var(--muted)}
.open{flex:none;font-size:13px;color:var(--muted);text-decoration:none;padding:2px 0}
.open:hover{color:var(--fg)}
.preview{display:flex;align-items:center;justify-content:center;min-height:92px;padding:16px;overflow:auto;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background-color:var(--soft);background-image:radial-gradient(#e5e5e5 1px,transparent 1px);background-size:14px 14px}
.preview.dark{background-color:#0a0a0a;background-image:radial-gradient(#262626 1px,transparent 1px)}
.preview img{max-width:100%;height:auto}
.snippets{margin:0;padding:12px 16px 16px;display:grid;gap:10px}
dt{margin-bottom:4px;font:11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
dd{margin:0}
code{font-family:var(--mono);font-size:12.5px}
.snippets code,.signature{display:block;overflow-wrap:anywhere;white-space:pre-wrap;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--soft);color:var(--fg-2);line-height:1.6}
.signature{padding:10px 14px;font-size:13px;color:var(--fg)}
.signature.by{margin-top:24px}
.signature b{font-weight:600;margin-right:10px;color:var(--muted)}
.note{margin:8px 0 16px;font-size:13px;color:var(--muted)}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}
th{padding:10px 16px;font:500 12px var(--mono);letter-spacing:.04em;text-transform:uppercase;color:var(--muted);background:var(--soft);border-bottom:1px solid var(--line)}
td{padding:10px 16px;vertical-align:top;border-bottom:1px solid var(--line);color:var(--fg-2)}
tr:last-child td{border-bottom:0}
td:first-child{width:160px;white-space:nowrap;font:500 13px var(--mono);color:var(--fg)}
.facts{margin:16px 0 0;padding:0;list-style:none;display:grid;gap:6px;color:var(--fg-2);font-size:14px}
.facts li{position:relative;padding-left:18px}
.facts li::before{content:"";position:absolute;left:2px;top:.72em;width:6px;height:1px;background:var(--fg)}
footer{padding:20px 0 32px;font-size:13px;color:var(--muted)}
@media(max-width:560px){.nav-inner,main{padding:0 16px}.brand span{display:none}.hero{padding:32px 0 28px}section{padding:28px 0}td:first-child{width:auto}}
`;

export function renderHome(
  origin: string,
  language: HomeLanguage = 'en',
): string {
  const t = copy[language];
  const title =
    language === 'zh'
      ? 'Midscene Test Badge — Markdown E2E 测试结果徽章'
      : 'Midscene Test Badge — E2E test results for Markdown';
  const canonical = `${BADGE_ORIGIN}/?lang=${language}`;
  const renderExample = (index: number, withSkipped?: boolean) => {
    const example = examples[index];
    const { alt, link } = example;
    const rawPath =
      withSkipped && !example.path.includes('skipped=')
        ? `${example.path}&skipped=5`
        : example.path;
    const path = escapeHtml(rawPath);
    const url = escapeHtml(`${origin}${rawPath}`);
    const dark = rawPath.includes('theme=dark') ? ' dark' : '';
    const markdown = link
      ? `[![${alt}](${url})](${link})`
      : `![${alt}](${url})`;
    const name =
      withSkipped && index === 4 ? t.passedAndSkipped : t.names[index];
    const variant =
      withSkipped === undefined
        ? ''
        : t.previewColumns[withSkipped ? 1 : 0].title;
    return `<article><div class="card-head"><div>${variant ? `<span class="variant-label">${variant}</span>` : ''}<h4>${name}</h4><p>${t.details[index]}</p></div><a class="open" href="${path}">${t.open} ↗</a></div><div class="preview${dark}"><img src="${path}" alt="${name}${variant ? ` · ${variant}` : ''} ${t.preview}"></div><dl class="snippets"><div><dt>URL</dt><dd><code>${url}</code></dd></div><div><dt>Markdown</dt><dd><code>${markdown}</code></dd></div></dl></article>`;
  };
  const columnHead = `<div class="comparison-head">${t.previewColumns.map(({ title, detail }) => `<div><h3>${title}</h3><p class="note">${detail}</p></div>`).join('')}</div>`;
  const comparisons = [0, 1, 2, 3, 4, 5]
    .map(
      (index) =>
        `<div class="comparison-row">${renderExample(index, false)}${renderExample(index === 5 ? 6 : index, true)}</div>`,
    )
    .join('');
  const staticBadges = `<h3 class="static-title">${t.staticTitle}</h3><div class="grid">${renderExample(7)}${renderExample(8)}</div>`;
  return `<!doctype html>
<html lang="${language === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#ffffff"><title>${title}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="description" content="${escapeHtml(t.intro)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en" href="${BADGE_ORIGIN}/?lang=en">
<link rel="alternate" hreflang="zh" href="${BADGE_ORIGIN}/?lang=zh">
<link rel="alternate" hreflang="x-default" href="${BADGE_ORIGIN}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Midscene Test Badge">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${escapeHtml(t.intro)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="${language === 'zh' ? 'zh_CN' : 'en_US'}">
<meta property="og:locale:alternate" content="${language === 'zh' ? 'en_US' : 'zh_CN'}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${escapeHtml(t.intro)}">
<style>${STYLE}</style></head><body>
<header class="nav"><div class="nav-inner"><a class="brand" href="${SITE}"><img class="logo" src="${LOGO_96}" alt="Midscene" width="23" height="22">Midscene Test<span>/ Badge</span></a><nav class="languages" aria-label="${t.language}"><a href="/?lang=zh" lang="zh-CN"${language === 'zh' ? ' aria-current="page"' : ''}>中文</a><a href="/?lang=en" lang="en"${language === 'en' ? ' aria-current="page"' : ''}>English</a></nav></div></header>
<main>
<div class="hero"><p class="eyebrow"><i></i>GET /e2e · SVG</p><h1>${t.title}</h1><p>${t.intro}</p><p class="powered">${t.poweredBy.replace('{link}', `<a href="${SITE}">Midscene.js</a>`)}</p></div>
<section id="previews"><div class="section-head"><span>01</span><h2>${t.previews}</h2></div>${columnHead}${comparisons}${staticBadges}</section>
<section id="parameters"><div class="section-head"><span>02</span><h2>${t.parameters}</h2></div><code class="signature"><b>GET</b>${escapeHtml(origin)}/e2e?pass=&lt;n&gt;&amp;fail=&lt;n&gt;[&amp;skipped=&lt;n&gt;][&amp;style=flat|large|card][&amp;theme=light|dark]</code><p class="note">${t.optional}</p>
<div class="table-wrap"><table><thead><tr><th>${t.parameter}</th><th>${t.rule}</th></tr></thead><tbody>
<tr><td>pass / fail</td><td>${t.counts}</td></tr>
<tr><td>skipped</td><td>${t.skipped}</td></tr>
<tr><td>style</td><td>${t.styles}</td></tr>
<tr><td>theme</td><td>${t.themes}</td></tr>
</tbody></table></div><ul class="facts"><li>${t.source}</li><li>${t.cache}</li></ul>
<code class="signature by"><b>GET</b>${escapeHtml(origin)}/by-midscene[?style=flat|large]</code><p class="note">${t.by}</p></section>
<footer>${t.footer}</footer>
</main></body></html>`;
}
