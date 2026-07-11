import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractRoutePreloads,
  injectRoutePreloads,
  routePathToHtmlPath,
} from './rspress-route-preload.mjs';

describe('Rspress route preload injection', () => {
  it('extracts numeric and quoted async chunk ids', () => {
    const source = [
      '{path:"/",element:a.createElement(r),filePath:"en/index.md",preload:async()=>(await r.preload(),Promise.all([i.e(4194),i.e("100")]).then(i.bind(i,1))),lang:"en",version:""}',
    ].join(',');

    expect(extractRoutePreloads(source)).toEqual([
      {
        chunkIds: ['4194', '100'],
        lang: 'en',
        pageId: 'en/index.md',
        routePath: '/',
      },
    ]);
  });

  it('maps generated route paths to HTML files', () => {
    expect(routePathToHtmlPath('/')).toBe('index.html');
    expect(routePathToHtmlPath('/guide/start')).toBe('guide/start.html');
    expect(routePathToHtmlPath('/guide/')).toBe('guide/index.html');
    expect(routePathToHtmlPath('/zh/')).toBe('zh/index.html');
  });

  it('injects exact route chunks and remains idempotent', async () => {
    const outputDir = await mkdtemp(
      path.join(os.tmpdir(), 'rspress-route-preload-'),
    );
    const asyncDir = path.join(outputDir, 'static/js/async');
    const jsDir = path.join(outputDir, 'static/js');
    await mkdir(path.join(outputDir, 'guide'), { recursive: true });
    await mkdir(asyncDir, { recursive: true });
    await writeFile(path.join(asyncDir, '100.home.js'), 'home');
    await writeFile(path.join(asyncDir, '200.guide.js'), 'guide');
    await writeFile(
      path.join(jsDir, 'index.runtime.js'),
      [
        '{path:"/",element:a.createElement(r),filePath:"en/index.md",preload:async()=>(i.e("100").then(i.bind(i,1))),lang:"en",version:""}',
        '{path:"/guide/start",element:a.createElement(r),filePath:"en/guide/start.mdx",preload:async()=>(i.e("200").then(i.bind(i,2))),lang:"en",version:""}',
      ].join(','),
    );
    const html =
      '<html><head></head><body><div id="__rspress_root"></div></body></html>';
    await writeFile(path.join(outputDir, 'index.html'), html);
    await writeFile(path.join(outputDir, 'guide/start.html'), html);

    try {
      await expect(injectRoutePreloads({ outputDir })).resolves.toEqual({
        injected: 2,
        mappedPages: 2,
        preloadedChunks: 2,
        unchanged: 0,
      });
      await expect(injectRoutePreloads({ outputDir })).resolves.toEqual({
        injected: 0,
        mappedPages: 2,
        preloadedChunks: 2,
        unchanged: 2,
      });
      expect(
        await readFile(path.join(outputDir, 'index.html'), 'utf8'),
      ).toMatch(
        /href="\/static\/js\/async\/100\.home\.js" data-rspress-route-preload/,
      );
    } finally {
      await rm(outputDir, { force: true, recursive: true });
    }
  });
});
