import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { WebRecorder, readTrace } from '../dist/es/tooling.mjs';
import { connectToTab, startUrl } from './browser.mjs';

export function brief(recording, out) {
  const trace = readTrace(recording);
  const effects = new Map(
    trace.events.filter((e) => e.type === 'effect').map((e) => [e.of, e]),
  );
  const lines = [
    '# Recording evidence',
    '',
    `Start: ${trace.meta.start.screen}`,
    `End: ${trace.meta.end?.screen ?? trace.events.filter((e) => e.type === 'screen').at(-1)?.screen ?? 'not captured'}`,
    `Terminal image: ${trace.meta.end ? trace.frames[trace.meta.end.frame] : 'MISSING: any live terminal image must be labelled supplemental evidence'}`,
    '',
    'Read events.jsonl and target samples for complete identity, input values, ancestors and causal evidence. This index is not the recording. Follow the bundled midscene-replay Skill.',
    '',
  ];
  for (const e of trace.events) {
    if (
      ['move', 'effect'].includes(e.type) ||
      e.phase === 'up' ||
      e.phase === 'start'
    )
      continue;
    lines.push(
      `- ${JSON.stringify({ source: e.id, at: e.t, type: e.type, phase: e.phase, key: e.key, screen: e.screen, name: e.target?.fingerprint?.name, ancestor: e.target?.ancestor, xpaths: e.target?.locators?.filter((l) => l.kind === 'web.xpath').map((l) => l.value), option: e.type === 'select' ? { value: e.value, label: e.label } : undefined, state: e.state, revealedBy: e.revealedBy, limitation: e.target?.visualOnly, before: trace.frames[e.before], after: trace.frames[effects.get(e.id)?.after] })}`,
    );
  }
  const file = join(out, 'brief.md');
  writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

export async function record(
  url,
  out,
  { cdp, browser: engine = 'chrome' } = {},
) {
  const { browser, page: existingPage } = cdp
    ? await connectToTab(cdp, startUrl(url))
    : { browser: await launchRecordingBrowser(engine) };
  let recorder;
  try {
    mkdirSync(dirname(out), { recursive: true });
    mkdirSync(out);
    const page = existingPage ?? (await browser.newPage());
    if (existingPage) await page.bringToFront();
    else await page.goto(url);
    recorder = new WebRecorder(page, { captureAncestors: true });
    await recorder.start();
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const cancel = new AbortController();
    terminal.once('SIGINT', () => cancel.abort());
    terminal.once('close', () => cancel.abort());
    try {
      await terminal.question('Recording. Press Enter to finish.\n', {
        signal: cancel.signal,
      });
    } finally {
      terminal.close();
    }
    await recorder.stop(out);
    return brief(out, out);
  } finally {
    try {
      await recorder?.dispose();
    } finally {
      await browser.close();
    }
  }
}

async function launchRecordingBrowser(engine) {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch({
      headless: false,
      channel: engine === 'chromium' ? undefined : engine,
    });
  } catch (error) {
    if (engine === 'chromium') throw error;
    throw new Error(
      `Could not launch ${engine}. Check that it is installed, or use --browser chromium.\n${error.message}`,
      { cause: error },
    );
  }
}
