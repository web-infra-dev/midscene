import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UiNode } from '@midscene/core/internal/device-cache';
import { describe, expect, it } from 'vitest';
import {
  type PageMetadata,
  type VisualInventory,
  buildPageAuditData,
  buildTreeNodeAuditRecords,
  enumerateUiTree,
  helpText,
  parseCliOptions,
  rebuildRunReport,
  renderPageHtml,
} from '../../scripts/accessibility-xpath-audit';

function node(
  type: string,
  bounds: { left: number; top: number; width: number; height: number },
  attrs: Record<string, string> = {},
  children: UiNode[] = [],
): UiNode {
  return { type, bounds, attrs, children };
}

function auditTree(): UiNode {
  return node(
    'android.widget.FrameLayout',
    { left: 0, top: 0, width: 400, height: 800 },
    { package: 'com.ss.android.ugc.aweme' },
    [
      node(
        'android.widget.Button',
        { left: 10, top: 10, width: 80, height: 50 },
        { 'resource-id': 'hit', clickable: 'true' },
      ),
      node(
        'android.view.View',
        { left: 10, top: 100, width: 80, height: 50 },
        { clickable: 'true' },
      ),
      node(
        'android.widget.TextView',
        { left: 10, top: 200, width: 80, height: 50 },
        { text: 'Repeated action', clickable: 'true' },
      ),
      node(
        'android.widget.TextView',
        { left: 120, top: 200, width: 80, height: 50 },
        { text: 'Repeated action', clickable: 'true' },
      ),
      node(
        'android.view.ViewGroup',
        { left: 10, top: 300, width: 150, height: 100 },
        { 'resource-id': 'intended-parent', clickable: 'true' },
        [
          node(
            'android.widget.Button',
            { left: 10, top: 300, width: 150, height: 100 },
            { 'resource-id': 'selected-child', clickable: 'true' },
          ),
        ],
      ),
    ],
  );
}

function inventory(name = 'Stable control'): VisualInventory {
  return {
    schemaVersion: 2,
    coordinateSpace: 'screenshot-pixel',
    reviewed: true,
    elements: [
      {
        id: 'stable',
        name,
        description: 'Stable control',
        point: { x: 50, y: 35 },
        rect: { left: 10, top: 10, width: 80, height: 50 },
        treeNodeId: 'node-0002',
      },
      {
        id: 'positional',
        name: 'Tree-only control',
        description: 'Tree-only control',
        point: { x: 50, y: 125 },
        rect: { left: 10, top: 100, width: 80, height: 50 },
        treeNodeId: 'node-0003',
      },
      {
        id: 'duplicate',
        name: 'Repeated action',
        description: 'Repeated action',
        point: { x: 50, y: 225 },
        rect: { left: 10, top: 200, width: 80, height: 50 },
        treeNodeId: 'node-0004',
      },
      {
        id: 'unexposed',
        name: 'Painted canvas action',
        description: 'Painted canvas action',
        point: { x: 350, y: 700 },
        rect: { left: 320, top: 680, width: 60, height: 40 },
        treeNodeId: null,
      },
      {
        id: 'overlap',
        name: 'Overlapping parent',
        description: 'Overlapping parent',
        point: { x: 80, y: 350 },
        rect: { left: 10, top: 300, width: 150, height: 100 },
        treeNodeId: 'node-0006',
      },
    ],
  };
}

function metadata(): PageMetadata {
  return {
    schemaVersion: 2,
    reportKind: 'cli-capture',
    pageId: 'douyin-search',
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:01.000Z',
    device: {
      serial: 'fixture',
      manufacturer: 'Fixture',
      model: 'Phone',
      androidVersion: '13',
      apiLevel: '33',
      resolution: {
        physical: { width: 400, height: 800 },
        logical: { width: 400, height: 800 },
        screenshot: { width: 400, height: 800 },
      },
      density: 160,
      dpr: 1,
      rotation: 0,
    },
    app: {
      expectedPackage: 'com.ss.android.ugc.aweme',
      package: 'com.ss.android.ugc.aweme',
      activity: '.MainActivity',
      versionName: '1.0',
      versionCode: '1',
    },
    entryPath: 'Open search',
    technology: {
      declaredStack: 'Lynx',
      confidence: 'suspected',
      evidence: ['Tree shape only; not confirmed'],
    },
    sourceUsed: 'yadb',
    captures: {},
  };
}

describe('accessibility XPath audit', () => {
  it('enumerates every node with deterministic absolute structural XPath', () => {
    const root = node(
      'android.widget.FrameLayout',
      { left: 0, top: 0, width: 100, height: 100 },
      {},
      [
        node('android.widget.TextView', {
          left: 0,
          top: 0,
          width: 10,
          height: 10,
        }),
        node('android.widget.TextView', {
          left: 10,
          top: 0,
          width: 10,
          height: 10,
        }),
        node('android.view.View$Inner', {
          left: 20,
          top: 0,
          width: 10,
          height: 10,
        }),
      ],
    );

    const result = enumerateUiTree(root);
    expect(result.nodes.map((entry) => entry.nodeId)).toEqual([
      'node-0001',
      'node-0002',
      'node-0003',
      'node-0004',
    ]);
    expect(result.nodes.map((entry) => entry.structuralXpath)).toEqual([
      '/android.widget.FrameLayout[1]',
      '/android.widget.FrameLayout[1]/android.widget.TextView[1]',
      '/android.widget.FrameLayout[1]/android.widget.TextView[2]',
      '/android.widget.FrameLayout[1]/*[3]',
    ]);
  });

  it('uses the shared WebView interaction semantics for CLI tree records', () => {
    const root = node(
      'android.webkit.WebView',
      { left: 0, top: 0, width: 400, height: 800 },
      {},
      [
        node(
          'android.view.View',
          { left: 20, top: 20, width: 120, height: 60 },
          { 'chrome-role': 'button', clickable: 'false', text: 'Continue' },
        ),
      ],
    );

    const result = buildTreeNodeAuditRecords(root, 400, 800);

    expect(result.records[1]).toMatchObject({
      interactive: true,
      interactionEvidence: ['web-role'],
    });
  });

  it('classifies all five visual audit states and keeps every tree node', () => {
    const source = auditTree();
    const fresh = auditTree();
    const data = buildPageAuditData(inventory(), source, fresh, undefined, {
      screenshotWidth: 400,
      screenshotHeight: 800,
      logicalWidth: 400,
      logicalHeight: 800,
    });

    expect(data.elements.treeNodes).toHaveLength(7);
    expect(
      Object.fromEntries(
        data.elements.visualElements.map((element) => [
          element.id,
          element.status,
        ]),
      ),
    ).toEqual({
      stable: 'cache-xpath-hit',
      positional: 'tree-only-positional',
      duplicate: 'exposed-no-safe-xpath',
      unexposed: 'not-exposed',
      overlap: 'point-selected-other',
    });
    const stable = data.elements.visualElements[0];
    expect(stable.cacheFeatureXpaths[0]).toBe("//*[@resource-id='hit']");
    expect(stable.sourceUnique).toBe(true);
    expect(stable.fresh.outcome).toBe('hit');
    expect(stable.revisit.outcome).toBe('pending');
  });

  it('escapes reviewer-controlled content in the static HTML report', () => {
    const source = auditTree();
    const visualInventory = inventory('<img src=x onerror=alert(1)>');
    const data = buildPageAuditData(
      visualInventory,
      source,
      auditTree(),
      auditTree(),
      {
        screenshotWidth: 400,
        screenshotHeight: 800,
        logicalWidth: 400,
        logicalHeight: 800,
      },
    );
    const html = renderPageHtml(
      metadata(),
      visualInventory,
      data.elements,
      data.replayResults,
    );

    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Complete Normalized UiNode Tree (7 nodes)');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Frame colors:');
    expect(html).toContain('Cache XPath Hit');
    expect(html).toContain('Structural XPath Only');
    expect(html).toContain('Exposed Without Safe XPath');
    expect(html).toContain('Not Exposed in Tree');
    expect(html).toContain('Point Selected Another Node');
    expect(html).toContain(
      'data-tooltip="Green: A safe cache XPath was generated, was unique in the source tree, and matched the same element in the fresh tree."',
    );
    expect(html).toContain(
      '.tooltip:hover::after,.tooltip:focus-visible::after{opacity:1;visibility:visible}',
    );
  });

  it('renders every normalized node as a collapsible parent-child hierarchy', () => {
    const source = auditTree();
    source.children[1].attrs['content-desc'] = '<unsafe tree identity>';
    const visualInventory = inventory();
    const data = buildPageAuditData(
      visualInventory,
      source,
      auditTree(),
      auditTree(),
      {
        screenshotWidth: 400,
        screenshotHeight: 800,
        logicalWidth: 400,
        logicalHeight: 800,
      },
    );
    const html = renderPageHtml(
      metadata(),
      visualInventory,
      data.elements,
      data.replayResults,
    );

    expect(html.match(/data-tree-node-id=/g)).toHaveLength(7);
    expect(html).toContain(
      '<details class="ui-tree-node" data-tree-node-id="node-0001" data-parent-node-id="" open>',
    );
    expect(html).toContain(
      'data-tree-node-id="node-0002" data-parent-node-id="node-0001"',
    );
    expect(html).toContain(
      'data-tree-node-id="node-0007" data-parent-node-id="node-0006"',
    );
    expect(html).not.toContain('<unsafe tree identity>');
    expect(html).toContain('&lt;unsafe tree identity&gt;');
    expect(html).toContain('data-tree-action="expand"');
    expect(html).toContain('data-tree-action="collapse"');
    expect(html).toContain('Midscene Cache XPath Candidates');
    expect(html).toContain('Flat Diagnostic Table (7 nodes)');
    const screenshotIndex = html.indexOf('<section class="shot-panel">');
    const rightColumnIndex = html.indexOf('<div class="right-column">');
    const treePanelIndex = html.indexOf('<section class="tree">');
    const detailPanelIndex = html.indexOf('<section class="details-panel">');
    expect(screenshotIndex).toBeGreaterThan(-1);
    expect(rightColumnIndex).toBeGreaterThan(screenshotIndex);
    expect(treePanelIndex).toBeGreaterThan(rightColumnIndex);
    expect(detailPanelIndex).toBeGreaterThan(treePanelIndex);
  });

  it('parses the documented capture command and repeatable stack evidence', () => {
    expect(
      parseCliOptions([
        'capture',
        '--device',
        'serial-1',
        '--page',
        'douyin-search',
        '--tech-stack',
        'Lynx',
        '--tech-confidence',
        'strong',
        '--tech-evidence',
        'runtime component',
        '--tech-evidence',
        'activity class',
      ]),
    ).toMatchObject({
      command: 'capture',
      phase: 'source',
      device: 'serial-1',
      app: 'com.ss.android.ugc.aweme',
      page: 'douyin-search',
      technology: {
        declaredStack: 'Lynx',
        confidence: 'strong',
        evidence: ['runtime component', 'activity class'],
      },
    });
    expect(helpText()).toContain(
      'Source automatically captures an immediate fresh tree',
    );
    expect(() =>
      parseCliOptions([
        'capture',
        '--device',
        'serial-1',
        '--page',
        'douyin-search',
        '--app',
        'invalid;package',
      ]),
    ).toThrow('Invalid Android package name');
    expect(() =>
      parseCliOptions(['render', '--run-id', 'first', '--run', 'second']),
    ).toThrow('Use either --run-id or --run');
  });

  it('writes the aggregate and per-page report artifact contract', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'xpath-audit-report-'));
    const pageDir = join(tempRoot, 'pages', 'douyin-search');
    await mkdir(pageDir, { recursive: true });
    const xml = `<?xml version="1.0"?><hierarchy rotation="0"><node class="android.widget.FrameLayout" package="com.ss.android.ugc.aweme" bounds="[0,0][400,800]"><node class="android.widget.Button" resource-id="hit" clickable="true" bounds="[10,10][90,60]"/></node></hierarchy>`;
    const pageMetadata = metadata();
    const capturedAt = '2026-07-21T00:00:00.000Z';
    const artifact = (file: string) => ({
      file,
      capturedAt,
      sha256: 'fixture-sha256',
      bytes: 1,
    });
    pageMetadata.captures = {
      source: {
        phase: 'source',
        capturedAt,
        treeSource: 'yadb',
        screenshot: artifact('screenshot.png'),
        usedXml: artifact('source-used.xml'),
        sources: {},
        sourceFailures: [],
      },
      fresh: {
        phase: 'fresh',
        capturedAt,
        treeSource: 'yadb',
        screenshot: artifact('fresh-screenshot.png'),
        usedXml: artifact('fresh-replay.xml'),
        sources: {},
        sourceFailures: [],
      },
      revisit: {
        phase: 'revisit',
        capturedAt,
        treeSource: 'yadb',
        screenshot: artifact('revisit-screenshot.png'),
        usedXml: artifact('revisit-replay.xml'),
        sources: {},
        sourceFailures: [],
      },
    };
    const visualInventory: VisualInventory = {
      schemaVersion: 2,
      coordinateSpace: 'screenshot-pixel',
      reviewed: true,
      elements: [inventory().elements[0]],
    };

    try {
      await Promise.all([
        writeFile(
          join(tempRoot, 'run.json'),
          JSON.stringify({
            schemaVersion: 2,
            reportKind: 'cli-capture',
            runId: 'fixture-run',
            createdAt: '2026-07-21T00:00:00.000Z',
            updatedAt: '2026-07-21T00:00:00.000Z',
            repository: { root: '/fixture', branch: 'fixture', commit: 'abc' },
            pages: ['douyin-search'],
          }),
        ),
        writeFile(join(pageDir, 'metadata.json'), JSON.stringify(pageMetadata)),
        writeFile(
          join(pageDir, 'visual-elements.json'),
          JSON.stringify(visualInventory),
        ),
        writeFile(join(pageDir, 'source-used.xml'), xml),
        writeFile(join(pageDir, 'fresh-replay.xml'), xml),
        writeFile(join(pageDir, 'revisit-replay.xml'), xml),
        writeFile(join(pageDir, 'screenshot.png'), 'fixture'),
      ]);

      const summary = await rebuildRunReport(tempRoot);
      expect(summary.pages[0]).toMatchObject({
        treeNodeCount: 2,
        visualElementCount: 1,
        safeXpathCount: 1,
        fresh: { hits: 1 },
        revisit: { hits: 1 },
        rolloutGate: {
          status: 'pass',
          freshStable: true,
          revisitStable: true,
        },
      });
      for (const artifact of [
        join(tempRoot, 'index.html'),
        join(tempRoot, 'summary.json'),
        join(pageDir, 'ui-tree.json'),
        join(pageDir, 'elements.json'),
        join(pageDir, 'replay-results.json'),
        join(pageDir, 'annotated.html'),
      ]) {
        expect((await readFile(artifact)).length).toBeGreaterThan(0);
      }
      const indexHtml = await readFile(join(tempRoot, 'index.html'), 'utf8');
      const pageHtml = await readFile(join(pageDir, 'annotated.html'), 'utf8');
      expect(indexHtml).toContain('<html lang="en">');
      expect(indexHtml).toContain('Android Accessibility XPath Audit');
      expect(indexHtml).toContain('Acceptance Gate');
      expect(indexHtml).toContain(
        'data-tooltip="Capture is complete, safe XPaths',
      );
      expect(pageHtml).toContain('Evidence and Replay Summary');
      expect(pageHtml).toContain('Fresh:');

      await writeFile(
        join(pageDir, 'revisit-replay.xml'),
        '<?xml version="1.0"?><hierarchy rotation="0"><node class="android.widget.FrameLayout" package="com.ss.android.ugc.aweme" bounds="[0,0][400,800]"/></hierarchy>',
      );
      const unstableSummary = await rebuildRunReport(tempRoot);
      expect(unstableSummary.pages[0]).toMatchObject({
        revisit: { hits: 0, misses: 1 },
        rolloutGate: {
          status: 'fail',
          freshStable: true,
          revisitStable: false,
        },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
