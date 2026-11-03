const examples = [
  {
    name: 'Flat',
    detail: '默认单行 · 20px / Default, 20px',
    query: 'pass=42&fail=3',
    dark: false,
  },
  {
    name: 'Large',
    detail: '大号单行 · 28px / Large, 28px',
    query: 'pass=42&fail=3&style=large',
    dark: false,
  },
  {
    name: 'Card · Light',
    detail: '浅色卡片 · 60px / Light card, 60px',
    query: 'pass=42&fail=3&style=card&theme=light',
    dark: false,
  },
  {
    name: 'Card · Dark',
    detail: '深色卡片 · 60px / Dark card, 60px',
    query: 'pass=42&fail=3&style=card&theme=dark',
    dark: true,
  },
  {
    name: 'All passed',
    detail: '全部通过 / No failures',
    query: 'pass=45&fail=0',
    dark: false,
  },
  {
    name: 'No tests',
    detail: '暂无测试 · 通过率 0% / Empty run, 0%',
    query: 'pass=0&fail=0&style=card',
    dark: false,
  },
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

export function renderHome(origin: string): string {
  const cards = examples
    .map(({ name, detail, query, dark }) => {
      const path = escapeHtml(`/e2e?${query}`);
      const url = escapeHtml(`${origin}/e2e?${query}`);
      return `<article><h3>${name}</h3><p>${detail}</p><div class="preview${dark ? ' dark' : ''}"><img src="${path}" alt="${name} badge preview"></div><a href="${path}">打开 SVG / Open SVG ↗</a><h4>URL</h4><code>${url}</code><h4>Markdown</h4><code>![Midscene Test](${url})</code></article>`;
    })
    .join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Midscene Test · Badges</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#24333f;font:15px/1.7 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:56px 24px}header{margin-bottom:36px}.eyebrow{color:#526777;font-weight:700;letter-spacing:.12em}h1{font-size:clamp(32px,6vw,48px);line-height:1.15;margin:14px 0}h2{margin-top:40px}h3{margin:0;font-size:20px}h4{margin:18px 0 6px;font-size:12px;color:#526777}p{color:#526777;margin:8px 0 16px}a{color:#1366a3}code{display:block;overflow-wrap:anywhere;white-space:pre-wrap;background:#f0f3f7;padding:12px;border-radius:8px;font-size:12px}table{width:100%;border-collapse:collapse;text-align:left;background:white}th,td{padding:14px;border-bottom:1px solid #e1e7ed;vertical-align:top}.table-wrap{overflow-x:auto;border:1px solid #e1e7ed;border-radius:12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:20px}article{background:white;border:1px solid #e1e7ed;border-radius:16px;padding:24px;min-width:0}.preview{min-height:112px;display:flex;align-items:center;justify-content:center;background:#f6f8fa;border-radius:10px;margin:20px 0;overflow:auto;padding:16px}.preview img{max-width:100%;height:auto}.dark{background:#0d1117}footer{margin-top:32px;color:#526777;font-size:13px}
</style></head><body><main>
<header><div class="eyebrow">MIDSCENE TEST</div><h1>Badge 服务 / Badge service</h1><p>为 README 和文档生成 SVG badge。选择样式，替换通过和失败数量，即可使用下方 URL 或 Markdown。<br>SVG badges for READMEs and docs. Pick a style and replace the counts in the URL or Markdown below.</p></header>
<section><h2>URL 规则 / URL rules</h2><code>${escapeHtml(origin)}/e2e?pass=&lt;n&gt;&amp;fail=&lt;n&gt;[&amp;style=flat|large|card][&amp;theme=light|dark]</code><p>方括号表示可选参数，使用时不要保留。/ Square brackets mark optional parameters; omit the brackets.</p>
<div class="table-wrap"><table><thead><tr><th>参数 / Parameter</th><th>规则 / Rule</th></tr></thead><tbody>
<tr><td>pass / fail</td><td>必填，0–9999999 的整数，分别表示通过数和失败数。<br>Required integers from 0 to 9999999: passed and failed counts.</td></tr>
<tr><td>style</td><td>可选：flat（默认，20px）、large（28px）、card（双行，60px）。<br>Optional: flat (default, 20px), large (28px), card (two lines, 60px).</td></tr>
<tr><td>theme</td><td>可选：light（默认）或 dark，仅影响 card 样式。<br>Optional: light (default) or dark; only affects card badges.</td></tr>
</tbody></table></div>
<p>数字由 URL 提供，不会自动读取 CI 或报告。卡片总数为 pass + fail，通过率为 pass / 总数；总数为 0 时显示 0%。失败数为 0 时，失败部分显示灰色。<br>Counts come from the URL, not CI or reports. Cards show the total and pass rate (0% for an empty run). Zero failures appear grey.</p>
<p>无效参数返回 HTTP 400 和错误说明。SVG 缓存时间为 24 小时。<br>Invalid parameters return HTTP 400 with an explanation. SVG responses are cached for 24 hours.</p></section>
<section><h2>效果预览 / Live previews</h2><div class="grid">${cards}</div></section>
<footer>所有预览均来自当前服务的 /e2e 接口。/ All previews use this service’s /e2e endpoint.</footer>
</main></body></html>`;
}
