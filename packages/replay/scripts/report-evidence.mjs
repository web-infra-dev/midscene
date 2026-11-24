import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const cell = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');

/** Index native Test results; execution facts and human business review stay separate. */
export function writeStepIndex(reports, out) {
  const lines = [
    '# Replay verification',
    '',
    'Execution results are not business approval. Review each actual screenshot against the original intent/recording.',
    '',
    '| Run | Case | Step | Native status | Duration | Evidence |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  const sheets = [];
  const heal = [];
  for (const report of reports) {
    const steps = [];
    const native = report.result;
    for (const item of native?.cases ?? []) {
      const run = item.run;
      for (const step of run?.steps ?? []) {
        const evidence = report.evidence.find(
          (entry) =>
            entry.scopeId === run.runId &&
            entry.phase === 'steps' &&
            entry.stepIndex === step.stepIndex,
        );
        const title = step.input?.prompt ?? step.input?.scenario ?? step.node;
        const image = evidence?.image;
        steps.push({
          number: step.stepIndex + 1,
          title: typeof title === 'string' ? title : JSON.stringify(title),
          status: step.status,
          image,
        });
        const links = [
          native.reportPath
            ? `[Native Test Report](${relative(out, native.reportPath)})`
            : 'report unavailable',
          image ? `[Screenshot](${report.folder}/${image})` : 'no screenshot',
        ];
        lines.push(
          `| ${report.index} | ${cell(item.name)} | ${step.stepIndex + 1}. ${cell(title)} | ${step.status} | ${step.durationMs ?? '-'} ms | ${links.join(' · ')} |`,
        );
      }
    }
    lines.push(
      '',
      `## Run ${report.index}`,
      '',
      `[Machine evidence](${report.folder}/replay.json) · [Console](${report.folder}/console.log)`,
      '',
      `Start observations: ${JSON.stringify(report.starts)}`,
      '',
      `Actual fetch model requests: ${report.modelRequests.length}. Native aggregate metrics: ${JSON.stringify(native?.metrics ?? {})}`,
      '',
    );
    heal.push(
      ...report.events
        .filter((event) => event.type === 'heal')
        .map((event) => ({ run: report.index, ...event })),
    );
    sheets.push({ folder: report.folder, steps });
  }
  if (heal.length)
    writeFileSync(join(out, 'heal.json'), JSON.stringify(heal, null, 2));
  writeFileSync(join(out, 'steps.md'), `${lines.join('\n')}\n`);
  return sheets;
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
