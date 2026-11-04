// Rspress checks a link's anchor against the headings written in the target
// page's own Markdown. It does not see anchors that come from `<span id>` or
// `<a id>`, from headings inside JSX, or from headings in imported MDX
// fragments. These anchors exist in the built HTML. List them here by target
// page, so the check still reports any other missing anchor.
//
// Keys are the last segment of the target route. Links without a path (`#id`)
// are checked against every page in the list.
const anchorsOutsideMarkdown: Record<string, string[]> = {
  reference: [
    'action-ready',
    'agentlogscreenshot',
    'aiact-deepthink',
    'common',
    'common-parameters',
    'custom-openai-client',
    'deep-locate-deeplocate',
    'default-waiting-strategy',
    'interaction-methods',
    'log-screenshot',
    'prompting-with-images',
    'runyaml',
    '使用图片作为提示词',
    '自定义-openai-客户端',
    '单次调用上下文',
    '深度定位deeplocate',
    '通过图像提示',
  ],
  // Model sections come from the shared model cards.
  'model-api-setup': [
    'ant-ling',
    'auto-glm',
    'deepseek',
    'doubao-seed-model',
    'gemini',
    'glm-v',
    'gpt',
    'jev',
    'kimi',
    'qwen',
    'ui-tars',
    'xiaomi-mimo',
  ],
  'model-config': ['multi-model-combination-example'],
  // platforms/web
  web: ['chrome-extension-faq'],
  // platforms/android (connection steps fragment) and sdk/android
  android: ['androiddevice', 'scrcpy', 'verify-device-connection'],
  ios: ['iosdevice'],
  // sdk/playwright
  playwright: ['about-opening-in-a-new-tab', '关于在新标签页打开'],
  vitest: ['lifecycle-and-exclusive-device-access', '生命周期与设备独占'],
  // midscene-test/use
  use: ['project-structure'],
};

const allAnchors = new Set(Object.values(anchorsOutsideMarkdown).flat());

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// The last route segment of a link path, for example `reference` for
// `../reference/index.mdx` or `/zh/reference/`.
function pageKey(path: string) {
  const segments = path
    .replace(/\.(mdx?|html)$/, '')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..');
  if (segments.at(-1) === 'index') segments.pop();
  return segments.at(-1) ?? '';
}

export function isAnchorOutsideMarkdown(url: string) {
  const hashIndex = url.indexOf('#');
  if (hashIndex < 0) return false;
  const anchor = decode(url.slice(hashIndex + 1));
  const path = url.slice(0, hashIndex);
  if (!path) return allAnchors.has(anchor);
  return anchorsOutsideMarkdown[pageKey(path)]?.includes(anchor) ?? false;
}
