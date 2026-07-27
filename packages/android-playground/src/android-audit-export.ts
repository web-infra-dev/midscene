import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AndroidAccessibilitySnapshot,
  AndroidAuditOverlay,
  AndroidAuditReplaySummary,
  AndroidAuditTreeNode,
  AndroidAuditVisualElement,
} from '@midscene/android';

export interface AndroidAuditExportInput {
  deviceId: string;
  fresh: AndroidAccessibilitySnapshot;
  overlays: AndroidAuditOverlay[];
  replay: AndroidAuditReplaySummary;
  screenshotBase64: string;
  source: AndroidAccessibilitySnapshot;
  treeNodes: AndroidAuditTreeNode[];
  visualElements: AndroidAuditVisualElement[];
  revisit?: {
    replay: AndroidAuditReplaySummary;
    snapshot: AndroidAccessibilitySnapshot;
  };
}

export interface AndroidAuditExportResult {
  indexHtml: string;
  outputDir: string;
  runId: string;
}

export interface AndroidAuditDownloadFile {
  contentBase64: string;
  relativePath: string;
}

export interface AndroidAuditDownloadBundle {
  directoryName: string;
  files: AndroidAuditDownloadFile[];
  runId: string;
}

export interface AndroidAuditExportWithDownload {
  download: AndroidAuditDownloadBundle;
  result: AndroidAuditExportResult;
}

const STATUS_LABELS: Record<AndroidAuditOverlay['status'], string> = {
  'cache-xpath-hit': 'Cache XPath Hit',
  'tree-only-positional': 'Structural XPath Only',
  'exposed-no-safe-xpath': 'Exposed Without Safe XPath',
  'not-exposed': 'Not Exposed in Tree',
  'point-selected-other': 'Point Selected Another Node',
  pending: 'Awaiting Fresh Validation',
};

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function html(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function screenshotBuffer(base64: string): Buffer {
  const match = base64
    .trim()
    .match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s);
  const body = match?.[1] ?? base64.trim();
  const buffer = Buffer.from(body, 'base64');
  if (buffer.length === 0) {
    throw new Error('Android audit screenshot is empty');
  }
  return buffer;
}

function runId(): string {
  return `playground-${new Date().toISOString().replace(/[-:.]/g, '')}`;
}

function statusCounts(overlays: AndroidAuditOverlay[]) {
  const counts: Record<string, number> = {};
  for (const overlay of overlays) {
    counts[overlay.status] = (counts[overlay.status] ?? 0) + 1;
  }
  return counts;
}

function renderAnnotatedReport(
  input: AndroidAuditExportInput,
  screenshotSrc: string,
): string {
  const size = input.source.logicalSize;
  const markers = input.overlays
    .map(
      (overlay, index) =>
        `<button class="marker status-${html(overlay.status)}" style="left:${(overlay.rect.left / size.width) * 100}%;top:${(overlay.rect.top / size.height) * 100}%;width:${(overlay.rect.width / size.width) * 100}%;height:${(overlay.rect.height / size.height) * 100}%" data-node="${html(overlay.nodeId ?? '')}" data-visual="${html(overlay.visualElementId ?? '')}" title="${html(`${STATUS_LABELS[overlay.status]}: ${overlay.statusReason ?? 'No additional details'}`)}"><span>${index + 1}</span></button>`,
    )
    .join('');
  const rows = input.treeNodes
    .map((node) => {
      const identity =
        node.attrs['resource-id'] ??
        node.attrs.text ??
        node.attrs['content-desc'] ??
        '';
      return `<button class="node" data-node="${html(node.nodeId)}" style="padding-left:${10 + node.depth * 14}px"><code>${html(node.nodeId)}</code><span>${html(node.type)}</span><small>${html(identity)}</small></button>`;
    })
    .join('');
  const data = JSON.stringify({
    overlays: input.overlays,
    treeNodes: input.treeNodes,
    visualElements: input.visualElements,
  }).replaceAll('<', '\\u003c');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Android XPath Audit</title>
<style>
*{box-sizing:border-box}body{margin:0;font:13px/1.45 system-ui;color:#0f172a;background:#f8fafc}.top{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;border-bottom:1px solid #e2e8f0;background:#fff}.layout{height:calc(100vh - 52px);display:grid;grid-template-columns:minmax(360px,1fr) minmax(420px,42%)}.screen-wrap{display:grid;place-items:center;padding:20px;overflow:hidden}.screen{position:relative;max-width:100%;max-height:100%;aspect-ratio:${size.width}/${size.height}}.screen img{display:block;width:100%;height:100%;object-fit:contain}.marker{--c:#64748b;position:absolute;border:2px solid var(--c);background:color-mix(in srgb,var(--c) 16%,transparent);cursor:pointer}.marker span{position:absolute;top:-21px;left:-2px;min-width:20px;height:19px;padding:0 5px;border-radius:10px;background:var(--c);font-weight:800;line-height:19px}.status-cache-xpath-hit{--c:#10b981}.status-tree-only-positional{--c:#f59e0b}.status-exposed-no-safe-xpath,.status-not-exposed{--c:#f43f5e}.status-point-selected-other{--c:#a855f7}.status-pending{--c:#64748b}.right{min-width:0;display:grid;grid-template-rows:55% 45%;border-left:1px solid #e2e8f0;background:#fff}.tree,.detail{min-height:0;padding:12px;overflow:auto}.tree{border-bottom:1px solid #e2e8f0}.node{display:grid;width:100%;grid-template-columns:78px minmax(0,1fr);gap:2px 7px;padding-top:5px;padding-right:7px;padding-bottom:5px;border:0;border-bottom:1px solid #f1f5f9;background:#fff;text-align:left;cursor:pointer}.node:hover,.node.active{background:#dbeafe}.node code{color:#2563eb}.node span,.node small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.node small{grid-column:2;color:#64748b}.legend{display:flex;gap:8px;flex-wrap:wrap}.legend i{width:10px;height:10px;border-radius:50%;display:inline-block;background:var(--c)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.45 ui-monospace,monospace}h2,h3{margin:0 0 8px}
</style></head><body>
<header class="top"><div><strong>Android XPath Audit</strong> · ${html(input.deviceId)} · ${html(input.source.source)}</div><div>source ${html(input.source.capturedAt)} · fresh ${html(input.fresh.capturedAt)}</div></header>
<main class="layout"><section class="screen-wrap"><div class="screen"><img src="${html(screenshotSrc)}" alt="Device screenshot">${markers}</div></section><aside class="right"><section class="tree"><h2>Complete UiNode Tree (${input.treeNodes.length})</h2>${rows}</section><section class="detail"><h3>Element Details</h3><p>Select a frame or tree node to inspect it.</p><pre id="detail">Nothing selected</pre></section></aside></main>
<script>const data=${data};const detail=document.querySelector('#detail');function select(id,visualId){document.querySelectorAll('[data-node]').forEach((el)=>el.classList.toggle('active',Boolean((visualId&&el.dataset.visual===visualId)||(id&&el.dataset.node===id))));const node=data.treeNodes.find((item)=>item.nodeId===id);const visual=data.visualElements.find((item)=>item.id===visualId);const overlay=data.overlays.find((item)=>visualId?item.visualElementId===visualId:item.nodeId===id);detail.textContent=JSON.stringify({name:visual?.name,status:overlay?${JSON.stringify(STATUS_LABELS)}[overlay.status]:undefined,statusReason:overlay?.statusReason,rectSource:visual?.rectSource,mappedNodeId:visual?.mappedNodeId,structuralXpath:visual?.structuralXpath??node?.structuralXpath,cacheFeatureXpaths:visual?.cacheFeatureXpaths??node?.cacheFeatureXpaths,candidateDiagnostics:visual?.candidateDiagnostics??node?.candidateDiagnostics,attrs:node?.attrs,bounds:visual?.rect??node?.bounds},null,2)}document.addEventListener('click',(event)=>{const target=event.target.closest('[data-node]');if(target)select(target.dataset.node,target.dataset.visual)});</script></body></html>`;
}

export async function writeAndroidAuditExportWithDownload(
  input: AndroidAuditExportInput,
  outputRoot = path.join(process.cwd(), 'midscene_run', 'douyin-xpath-audit'),
): Promise<AndroidAuditExportWithDownload> {
  const id = runId();
  const outputDir = path.join(outputRoot, id);
  const pageDir = path.join(outputDir, 'pages', 'playground-current');
  await mkdir(pageDir, { recursive: true });

  const screenshot = screenshotBuffer(input.screenshotBase64);
  const generatedAt = new Date().toISOString();
  const reportHtml = renderAnnotatedReport(input, 'screenshot.png');
  const indexReportHtml = renderAnnotatedReport(
    input,
    'pages/playground-current/screenshot.png',
  );
  const metadata = {
    schemaVersion: 1,
    pageId: 'playground-current',
    generatedAt,
    device: {
      serial: input.deviceId,
      logicalSize: input.source.logicalSize,
      dpr: input.source.dpr,
      rotation: input.source.rotation,
    },
    treeSource: input.source.source,
    captures: {
      source: {
        capturedAt: input.source.capturedAt,
        durationMs: input.source.durationMs,
        xmlSha256: sha256(input.source.sourceXml),
      },
      fresh: {
        capturedAt: input.fresh.capturedAt,
        durationMs: input.fresh.durationMs,
        xmlSha256: sha256(input.fresh.sourceXml),
      },
      ...(input.revisit
        ? {
            revisit: {
              capturedAt: input.revisit.snapshot.capturedAt,
              durationMs: input.revisit.snapshot.durationMs,
              xmlSha256: sha256(input.revisit.snapshot.sourceXml),
            },
          }
        : {}),
    },
    screenshot: {
      capturedAt: generatedAt,
      bytes: screenshot.length,
      sha256: sha256(screenshot),
    },
    transport: {
      cdpUsed: false,
      note: 'Android screenshot plus Accessibility tree; CDP was not used.',
    },
  };
  const summary = {
    schemaVersion: 1,
    generatedAt,
    runId: id,
    pages: 1,
    treeNodes: input.treeNodes.length,
    overlays: input.overlays.length,
    statuses: statusCounts(input.overlays),
    fresh: input.replay,
    revisit: input.revisit?.replay,
  };
  const run = {
    schemaVersion: 1,
    runId: id,
    createdAt: generatedAt,
    pages: ['playground-current'],
  };
  const replayResults = {
    generatedAt,
    fresh: input.replay,
    revisit: input.revisit?.replay,
  };
  const indexHtml = path.join(outputDir, 'index.html');
  const files: Array<{ content: Buffer | string; relativePath: string }> = [
    { relativePath: 'run.json', content: json(run) },
    { relativePath: 'summary.json', content: json(summary) },
    { relativePath: 'index.html', content: indexReportHtml },
    {
      relativePath: 'pages/playground-current/metadata.json',
      content: json(metadata),
    },
    {
      relativePath: 'pages/playground-current/screenshot.png',
      content: screenshot,
    },
    {
      relativePath: 'pages/playground-current/source-used.xml',
      content: input.source.sourceXml,
    },
    {
      relativePath: `pages/playground-current/${input.source.source}.xml`,
      content: input.source.sourceXml,
    },
    {
      relativePath: 'pages/playground-current/fresh-replay.xml',
      content: input.fresh.sourceXml,
    },
    ...(input.revisit
      ? [
          {
            relativePath: 'pages/playground-current/revisit-replay.xml',
            content: input.revisit.snapshot.sourceXml,
          },
        ]
      : []),
    {
      relativePath: 'pages/playground-current/ui-tree.json',
      content: json(input.source.root),
    },
    {
      relativePath: 'pages/playground-current/visual-elements.json',
      content: json({
        schemaVersion: 1,
        coordinateSpace: 'logical',
        reviewed: false,
        elements: input.visualElements,
      }),
    },
    {
      relativePath: 'pages/playground-current/elements.json',
      content: json({
        treeNodes: input.treeNodes,
        visualElements: input.visualElements,
      }),
    },
    {
      relativePath: 'pages/playground-current/replay-results.json',
      content: json(replayResults),
    },
    {
      relativePath: 'pages/playground-current/annotated.html',
      content: reportHtml,
    },
  ];

  await Promise.all(
    files.map((file) =>
      writeFile(
        path.join(outputDir, ...file.relativePath.split('/')),
        file.content,
      ),
    ),
  );

  return {
    download: {
      directoryName: id,
      files: files.map((file) => ({
        contentBase64: Buffer.from(file.content).toString('base64'),
        relativePath: file.relativePath,
      })),
      runId: id,
    },
    result: { indexHtml, outputDir, runId: id },
  };
}

export async function writeAndroidAuditExport(
  input: AndroidAuditExportInput,
  outputRoot = path.join(process.cwd(), 'midscene_run', 'douyin-xpath-audit'),
): Promise<AndroidAuditExportResult> {
  return (await writeAndroidAuditExportWithDownload(input, outputRoot)).result;
}
