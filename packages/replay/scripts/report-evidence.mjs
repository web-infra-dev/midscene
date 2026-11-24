import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest, imageBytes } from '../dist/es/tooling.mjs';

/** Export the native report as-is: ordering and status are execution facts. */
export function exportReportEvidence(dump, dir) {
  const images = new Map();
  const entries = [];
  mkdirSync(join(dir, 'images'));
  for (const [executionIndex, execution] of dump.executions.entries()) {
    for (const [taskIndex, task] of execution.tasks.entries()) {
      const entry = {
        sequence: entries.length + 1,
        executionIndex,
        taskIndex,
        taskId: task.taskId,
        description: execution.name,
        action: task.subType,
        status: task.status,
        error: task.error,
        content: task.param?.content,
        images: [],
      };
      for (const record of task.recorder ?? []) {
        if (record.type !== 'screenshot') continue;
        if (!record.screenshot?.base64)
          throw new Error('REPORT_IMAGE_MISSING: expected inline screenshot');
        const bytes = imageBytes(record.screenshot.base64);
        const hash = digest(bytes);
        let file = images.get(hash);
        if (!file) {
          const extension =
            bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpg' : 'png';
          file = `images/${hash}.${extension}`;
          writeFileSync(join(dir, file), bytes, { flag: 'wx' });
          images.set(hash, file);
        }
        entry.images.push({
          path: file,
          phase:
            record.timing ??
            (task.type === 'Log' ? 'checkpoint' : 'unspecified'),
          capturedAt: record.screenshot.capturedAt ?? record.ts,
        });
      }
      entries.push(entry);
    }
  }
  return { entries, images: images.size };
}

const markdownCell = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');

function attemptSummary(step) {
  if (!step?.attempts?.length) return '';
  const notes = step.attempts
    .filter((attempt) => attempt.status !== 'passed')
    .map(
      (attempt) =>
        `attempt ${attempt.attempt} ${attempt.status} in ${attempt.phase} after ${attempt.dispatched} Replay dispatch(es)${attempt.dispatchUnknown ? ' (native Agent accessed; dispatch unknown)' : ''}: ${attempt.error?.message ?? ''}${
          attempt.recoveryError
            ? ` (recovery check: ${attempt.recoveryError.message})`
            : ''
        }`,
    );
  return ` (${step.attempts.length} attempt(s)${notes.length ? `; ${notes.join('; ')}` : ''})`;
}

/**
 * Group one trial's evidence by first-class step. `steps` is the static step
 * list of the flow; each run's `flow` outcome is the authority for status.
 */
export function writeStepIndex(
  reports,
  out,
  steps,
  { acceptance, heal, host } = {},
) {
  const runs = reports.map(({ index }) => {
    const folder = `run-${index}`;
    const report = JSON.parse(
      readFileSync(join(out, folder, 'report.json'), 'utf8'),
    );
    const grouped = new Map(
      steps.map((step) => [step.id, { events: [], native: [] }]),
    );
    const boundaries = report.events.filter(
      (event) =>
        event.type === 'step' &&
        event.phase === 'attempt' &&
        Number.isSafeInteger(event.executionIndex),
    );
    for (const event of report.events)
      if (event.step?.id && event.type !== 'step')
        grouped.get(event.step.id)?.events.push(event);
    for (const entry of report.evidence?.entries ?? []) {
      const boundary = boundaries.findLast(
        (event) => event.executionIndex <= entry.executionIndex,
      );
      if (boundary) grouped.get(boundary.step.id)?.native.push(entry);
    }
    return { index, folder, report, grouped };
  });
  const lines = [
    '# Replay steps',
    '',
    'Evidence per step for review. Script assertions and business review are separate.',
    '',
    ...(host
      ? [
          `- Session ${host.session} · browser context ${host.browserContext} · tab ${host.tab} · business state ${host.businessState}`,
        ]
      : []),
    '- [Trial result and input digest](result.json) · [Frozen replay files](replay/)',
    ...(acceptance ? [`- [Business acceptance](${acceptance})`] : []),
    ...(heal ? [`- [Locator repair hints](${heal})`] : []),
    '',
  ];
  for (const [position, step] of steps.entries()) {
    lines.push(
      `<a id="step-${step.number}"></a>`,
      '',
      `## ${step.number}. ${markdownCell(step.title)} (\`${step.id}\`)`,
      '',
    );
    for (const { index, folder, report, grouped } of runs) {
      const outcome = report.flow?.steps?.[position];
      const evidence = grouped.get(step.id);
      lines.push(
        `- Run ${index}: ${outcome?.status ?? 'not-run'}${markdownCell(attemptSummary(outcome))}. [Report](${folder}/report.json)`,
      );
      for (const attempt of outcome?.attempts ?? []) {
        const phases = Object.entries(attempt.phaseMs ?? {})
          .map(([phase, ms]) => `${phase} ${Math.round(ms)} ms`)
          .join(', ');
        if (phases)
          lines.push(
            `  - Attempt ${attempt.attempt} timing: ${phases} (total ${Math.round(attempt.durationMs)} ms)`,
          );
      }
      for (const event of evidence.events) {
        if (event.type === 'checkpoint')
          lines.push(
            `  - Checkpoint ${markdownCell(event.title)}: ${markdownCell(event.status)}. Actual: ${markdownCell(JSON.stringify(event.actual))}`,
          );
        if (event.type === 'action')
          lines.push(
            `  - ${markdownCell(event.action)} ${markdownCell(event.prompt)}: ${markdownCell(event.dispatch)} (${event.resolvedBy ?? 'unresolved'}, attempt ${event.step.attempt})`,
          );
        if (event.type === 'heal')
          lines.push(
            `  - Repair hint for ${markdownCell(event.prompt)}: ${markdownCell((event.suggestions ?? []).join(' | ') || event.error)}`,
          );
        if (event.type === 'fallback')
          lines.push(
            `  - Fallback ${event.resolvedBy ?? event.mode ?? ''}: ${event.result} (${Math.round(event.durationMs)} ms)`,
          );
        if (event.type === 'wait' && event.title)
          lines.push(
            `  - Wait ${markdownCell(event.title)}: ${event.status ?? 'passed'} (${Math.round(event.durationMs)} ms)`,
          );
      }
      const images = new Map();
      for (const entry of evidence.native)
        for (const image of entry.images)
          images.set(image.path, entry.description || image.phase);
      if (
        outcome &&
        outcome.status !== 'not-run' &&
        outcome.status !== 'skipped'
      )
        lines.push(
          images.size
            ? `  - Images: ${[...images].map(([path, label]) => `[${markdownCell(label).replaceAll('[', '').replaceAll(']', '')}](${folder}/${path})`).join(', ')}`
            : '  - Screenshot evidence unavailable for this step.',
        );
    }
    lines.push('');
  }
  lines.push('## Full run evidence', '');
  for (const { index, folder, report } of runs) {
    const ranStep = report.flow?.steps?.some(
      (step) => !['not-run', 'skipped'].includes(step.status),
    );
    const links = [`[Run ${index} report](${folder}/report.json)`];
    if (report.reportHtml)
      links.push(
        `[Midscene Agent Test Report](${folder}/${report.reportHtml})`,
      );
    if (report.agentReport)
      links.push(`[Native Agent dump](${folder}/${report.agentReport})`);
    if (ranStep) links.push(`[Review sheet](${folder}/review.png)`);
    if (report.start)
      links.push(`[Start image](${folder}/${report.start.image})`);
    if (report.terminal)
      links.push(
        `[${report.execution === 'failed' ? 'Failure' : 'Terminal'} image](${folder}/${report.terminal.image})`,
      );
    lines.push(`- ${links.join(' · ')}`);
    if (report.reportHtmlError)
      lines.push(
        `  - HTML export failed: ${markdownCell(report.reportHtmlError.message)}`,
      );
    for (const error of report.errors ?? [])
      lines.push(
        `  - ${markdownCell(error.stage ?? 'execution')}: ${markdownCell(error.message)}`,
      );
  }
  writeFileSync(join(out, 'steps.md'), `${lines.join('\n')}\n`, { flag: 'wx' });
  return runs.map(({ folder, report, grouped }) => ({
    folder,
    steps: steps.map((step, position) => ({
      number: step.number,
      title: step.title,
      status: report.flow?.steps?.[position]?.status ?? 'not-run',
      image: grouped
        .get(step.id)
        .native.flatMap((entry) => entry.images.map((image) => image.path))
        .at(-1),
    })),
  }));
}

const escapeSvg = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/**
 * One contact sheet per run: the last native screenshot of every numbered
 * step, labelled with the step. It only rearranges actual evidence.
 */
export async function writeReviewSheets(runs, out) {
  const { default: sharp } = await import('sharp');
  const width = 480;
  const label = 32;
  const columns = 3;
  const written = [];
  for (const { folder, steps: all } of runs) {
    const steps = all.filter(
      (step) => step.status !== 'not-run' && step.status !== 'skipped',
    );
    if (!steps.length) continue;
    const tiles = [];
    for (const step of steps) {
      const caption = `${step.number}. ${step.title} · ${step.status}${step.image ? '' : ' · no screenshot'}`;
      const body = step.image
        ? await sharp(join(out, folder, step.image))
            .resize({ width })
            .png()
            .toBuffer()
        : await sharp({
            create: {
              width,
              height: 270,
              channels: 3,
              background: '#eeeeee',
            },
          })
            .png()
            .toBuffer();
      const { height } = await sharp(body).metadata();
      const header = Buffer.from(
        `<svg width="${width}" height="${label}"><rect width="100%" height="100%" fill="#222"/><text x="8" y="22" font-size="16" font-family="sans-serif" fill="#fff">${escapeSvg(caption.slice(0, 48))}</text></svg>`,
      );
      tiles.push({ body, header, height: height + label });
    }
    const rows = Math.ceil(tiles.length / columns);
    const rowHeights = Array.from({ length: rows }, (_, row) =>
      Math.max(
        ...tiles
          .slice(row * columns, row * columns + columns)
          .map((tile) => tile.height),
      ),
    );
    const composite = [];
    tiles.forEach((tile, i) => {
      const row = Math.floor(i / columns);
      const left = (i % columns) * width;
      const top = rowHeights.slice(0, row).reduce((a, b) => a + b, 0);
      composite.push(
        { input: tile.header, left, top },
        { input: tile.body, left, top: top + label },
      );
    });
    await sharp({
      create: {
        width: width * Math.min(columns, tiles.length),
        height: rowHeights.reduce((a, b) => a + b, 0),
        channels: 3,
        background: '#ffffff',
      },
    })
      .composite(composite)
      .png()
      .toFile(join(out, folder, 'review.png'));
    written.push(`${folder}/review.png`);
  }
  return written;
}
