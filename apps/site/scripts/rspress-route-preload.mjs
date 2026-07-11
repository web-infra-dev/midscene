import { realpathSync } from 'node:fs';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTE_PATTERN =
  /\{path:"([^"]+)",element:.*?,filePath:"([^"]+)",preload:async\(\)=>\((.*?)\),lang:"([^"]+)"/gs;
const PRELOAD_MARKER = 'data-rspress-route-preload';

export function extractRoutePreloads(source) {
  return [...source.matchAll(ROUTE_PATTERN)].map((match) => ({
    routePath: JSON.parse(`"${match[1]}"`),
    pageId: JSON.parse(`"${match[2]}"`),
    chunkIds: [
      ...match[3].matchAll(/\.e\((?:"([^"]+)"|'([^']+)'|(\d+))\)/g),
    ].map((chunkMatch) => chunkMatch[1] || chunkMatch[2] || chunkMatch[3]),
    lang: JSON.parse(`"${match[4]}"`),
  }));
}

export function routePathToHtmlPath(routePath) {
  const normalized = routePath.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  if (!normalized) return 'index.html';
  if (normalized.includes('*')) {
    throw new Error(`Cannot map wildcard route to HTML: ${routePath}`);
  }
  if (normalized.endsWith('/')) return `${normalized}index.html`;
  return `${normalized}.html`;
}

function parseArgs(argv) {
  const outputDir = argv[0];
  if (!outputDir) {
    throw new Error(
      'Usage: node scripts/rspress-route-preload.mjs <output-dir>',
    );
  }
  return { outputDir: path.resolve(outputDir) };
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function injectRoutePreloads({ outputDir }) {
  const asyncDir = path.join(outputDir, 'static/js/async');
  const chunkFiles = (await readdir(asyncDir))
    .filter((file) => file.endsWith('.js'))
    .sort();
  const chunkById = new Map(
    chunkFiles.map((file) => [file.split('.', 1)[0], file]),
  );
  const runtimeFiles = (
    await readdir(path.join(outputDir, 'static/js'))
  ).filter((file) => /^index\..+\.js$/.test(file));

  if (runtimeFiles.length !== 1) {
    throw new Error(
      `Expected one Rspress index runtime, found ${runtimeFiles.length}`,
    );
  }

  const runtimeSource = await readFile(
    path.join(outputDir, 'static/js', runtimeFiles[0]),
    'utf8',
  );
  const routes = extractRoutePreloads(runtimeSource);
  const htmlToChunks = new Map();

  if (routes.length === 0) {
    throw new Error(
      `No Rspress route preload entries found in ${runtimeFiles[0]}`,
    );
  }

  for (const route of routes) {
    const htmlRelativePath = routePathToHtmlPath(route.routePath);
    const htmlPath = path.join(outputDir, htmlRelativePath);
    const routeChunks = [
      ...new Set(route.chunkIds.map((id) => chunkById.get(id)).filter(Boolean)),
    ];

    if (!(await fileExists(htmlPath))) {
      throw new Error(
        `Rspress route ${route.routePath} maps to missing HTML: ${htmlRelativePath} (${route.pageId})`,
      );
    }
    if (routeChunks.length === 0) {
      throw new Error(
        `Rspress route ${route.routePath} has no preloadable async chunks (${route.pageId})`,
      );
    }

    const previousChunks = htmlToChunks.get(htmlRelativePath);
    if (previousChunks && previousChunks.join(',') !== routeChunks.join(',')) {
      throw new Error(
        `Rspress HTML ${htmlRelativePath} maps to conflicting chunk sets: ${previousChunks.join(', ')}, ${routeChunks.join(', ')}`,
      );
    }
    htmlToChunks.set(htmlRelativePath, routeChunks);
  }

  let injected = 0;
  let preloadedChunks = 0;
  let unchanged = 0;

  for (const [htmlRelativePath, routeChunks] of htmlToChunks) {
    const htmlPath = path.join(outputDir, htmlRelativePath);
    const html = await readFile(htmlPath, 'utf8');
    if (!html.includes('id="__rspress_root"')) {
      throw new Error(
        `Refusing to modify non-Rspress HTML mapped from a page chunk: ${htmlRelativePath}`,
      );
    }

    const existingMarker = new RegExp(
      `<link\\s+[^>]*${PRELOAD_MARKER}[^>]*>`,
      'g',
    );
    const markers = html.match(existingMarker) || [];
    const chunkUrls = routeChunks.map(
      (chunkFile) => `/static/js/async/${chunkFile}`,
    );
    preloadedChunks += chunkUrls.length;

    if (markers.length > 0) {
      const existingUrls = markers
        .map((marker) => marker.match(/href="([^"]+)"/)?.[1])
        .filter(Boolean)
        .sort();
      if (existingUrls.join(',') !== [...chunkUrls].sort().join(',')) {
        throw new Error(
          `Rspress HTML ${htmlRelativePath} contains a stale route preload marker`,
        );
      }
      unchanged += 1;
      continue;
    }

    if (!html.includes('</head>')) {
      throw new Error(
        `Rspress HTML ${htmlRelativePath} has no closing </head>`,
      );
    }
    const preloads = chunkUrls
      .map(
        (chunkUrl) =>
          `<link rel="preload" as="script" href="${chunkUrl}" ${PRELOAD_MARKER}>`,
      )
      .join('\n');
    await writeFile(htmlPath, html.replace('</head>', `${preloads}\n</head>`));
    injected += 1;
  }

  return {
    injected,
    mappedPages: htmlToChunks.size,
    preloadedChunks,
    unchanged,
  };
}

const isMain =
  process.argv[1] &&
  realpathSync(process.argv[1]) ===
    realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const result = await injectRoutePreloads(parseArgs(process.argv.slice(2)));
    console.log(
      `[rspress-route-preload] mapped=${result.mappedPages} injected=${result.injected} chunks=${result.preloadedChunks} unchanged=${result.unchanged}`,
    );
  } catch (error) {
    console.error(
      `[rspress-route-preload] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
