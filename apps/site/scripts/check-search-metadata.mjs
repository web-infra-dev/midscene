import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputRoot = path.join(siteRoot, 'doc_build');
const faviconUrl = 'https://midscenejs.com/favicon.png';
const ogImageUrl = 'https://midscenejs.com/og-image.png';

const readOutput = (relativePath, encoding = 'utf8') =>
  readFile(path.join(outputRoot, relativePath), encoding);

for (const relativePath of ['index.html', 'zh/index.html']) {
  const html = await readOutput(relativePath);
  assert.match(
    html,
    /<link rel="icon" type="image\/png" sizes="600x600" href="https:\/\/midscenejs\.com\/favicon\.png">/,
    `${relativePath} must declare the production square favicon`,
  );
  assert.ok(
    html.includes(ogImageUrl),
    `${relativePath} must reference the production OG image`,
  );
  const jsonLdMatch = html.match(
    /<script type="application\/ld\+json">([^<]+)<\/script>/,
  );
  assert.ok(
    jsonLdMatch,
    `${relativePath} must contain parseable identity JSON-LD`,
  );
  const identity = JSON.parse(jsonLdMatch[1]);
  const graph = identity['@graph'];
  const organization = graph.find((node) => node['@type'] === 'Organization');
  const website = graph.find((node) => node['@type'] === 'WebSite');
  assert.deepEqual(
    organization.logo,
    {
      '@type': 'ImageObject',
      url: faviconUrl,
      width: 600,
      height: 600,
    },
    `${relativePath} must identify the square logo`,
  );
  assert.equal(
    website.publisher['@id'],
    'https://midscenejs.com/#organization',
    `${relativePath} must connect the website to its publisher`,
  );
}

const favicon = await readOutput('favicon.png', null);
assert.deepEqual(
  [...favicon.subarray(0, 8)],
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'favicon.png must be a PNG file',
);
const faviconWidth = favicon.readUInt32BE(16);
const faviconHeight = favicon.readUInt32BE(20);
assert.equal(
  faviconWidth,
  faviconHeight,
  `favicon.png must be square, got ${faviconWidth}x${faviconHeight}`,
);

const generatedHeaders = await readOutput('_headers');
const headerBlocks = new Map(
  generatedHeaders
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const [route, ...headers] = block.split('\n');
      return [route, headers.join('\n')];
    }),
);

for (const imagePath of [
  '/images/platforms/android-dark.png',
  '/images/platforms/android-light.png',
]) {
  assert.match(
    headerBlocks.get(imagePath) ?? '',
    /^\s*X-Robots-Tag: noindex\s*$/m,
    `${imagePath} must return X-Robots-Tag: noindex`,
  );
}

const robots = await readOutput('robots.txt');
assert.match(
  robots,
  /^User-agent: \*$/m,
  'robots.txt must address all crawlers',
);
assert.match(
  robots,
  /^Allow: \/$/m,
  'robots.txt must allow the site to be crawled',
);
assert.match(
  robots,
  /^Sitemap: https:\/\/midscenejs\.com\/sitemap\.xml$/m,
  'robots.txt must reference the production sitemap',
);
assert.doesNotMatch(
  robots,
  /^Disallow:/m,
  'robots.txt must not prevent crawlers from reading noindex response headers',
);

console.log('Search metadata build checks passed.');
