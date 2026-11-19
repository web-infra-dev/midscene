// Ordered before existing geo rules so hostname and language change in one hop.
const apex = '(http.host eq "midscenejs.com")';
const path = 'http.request.uri.path';

function redirect(ref, description, expression, target) {
  return {
    ref,
    description,
    expression,
    action: 'redirect',
    enabled: true,
    action_parameters: {
      from_value: {
        target_url: { expression: target },
        status_code: 301,
        preserve_query_string: true,
      },
    },
  };
}

export const rules = [
  redirect(
    'midscene_apex_cn',
    'Apex China traffic directly to www Chinese documentation',
    `${apex} and ip.src.country eq "CN" and not (${path} eq "/zh" or starts_with(${path}, "/zh/")) and not (starts_with(${path}, "/images/") or starts_with(${path}, "/static/") or ${path} in {"/favicon.ico" "/favicon.png" "/og-image.png" "/robots.txt" "/sitemap.xml" "/sitemap-index.xml" "/apple-touch-icon.png" "/apple-touch-icon-precomposed.png"})`,
    `concat("https://www.midscenejs.com/zh", ${path})`,
  ),
  redirect(
    'midscene_apex_zh_root',
    'Apex Chinese homepage directly to canonical www homepage',
    `${apex} and ${path} eq "/zh"`,
    '"https://www.midscenejs.com/zh/"',
  ),
  redirect(
    'midscene_apex_www',
    'All remaining apex traffic to HTTPS www, preserving paths',
    apex,
    `concat("https://www.midscenejs.com", ${path})`,
  ),
];
