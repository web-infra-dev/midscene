import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  ReportMetaInput,
  Result,
} from '@/benchmark-grounding/core/schemas';
import { buildChromeArgs } from '@midscene/web/puppeteer-agent-launcher';
import { expect, test } from '@rstest/core';
import { execa } from 'execa';
import puppeteer from 'puppeteer';
import {
  fixture,
  writeFixture,
} from '../unit-test/benchmark-grounding/fixture';

test('plots independent axes and supports scatter hover, focus, and navigation', async () => {
  const run = await mkdtemp(path.join(tmpdir(), 'grounding-scatter-'));
  const evaluationId = '1795511258465';
  try {
    const records = [fixture('case-a'), fixture('case-b')];
    for (const record of records)
      await writeFixture(path.join(run, 'testcases'), record);
    const models: NonNullable<ReportMetaInput['models']> = {};
    const nearFast =
      'alpha-grounding-model-with-an-unusually-long-display-name';
    const nearSlow = 'beta-grounding-model-with-an-unusually-long-display-name';
    const foldStartModel = 'charlie-fold-start';
    const foldEndModel = 'delta-fold-end';
    const costlierTie = 'aardvark-costlier';
    const outcomes: [string, number, Result['output']][] = [
      [
        'fast-and-correct',
        1000,
        { type: 'POINT', correct: true, center: [0.5, 0.5] },
      ],
      ['slow-and-incorrect', 3644, { type: 'REFUSAL', correct: false }],
      [nearFast, 1000, { type: 'REFUSAL', correct: false }],
      [nearSlow, 3643, { type: 'POINT', correct: true, center: [0.5, 0.5] }],
      [costlierTie, 1000, { type: 'POINT', correct: true, center: [0.5, 0.5] }],
      [foldStartModel, 1750, { type: 'REFUSAL', correct: false }],
      [
        foldEndModel,
        3003,
        { type: 'POINT', correct: true, center: [0.5, 0.5] },
      ],
      [
        'timed-out',
        60000,
        {
          type: 'ERROR',
          correct: false,
          error: {
            name: 'TimeoutError',
            message: 'The model request timed out.',
            retryable: true,
          },
        },
      ],
    ];
    for (const [model, latency, output] of outcomes) {
      const fastest = model === 'fast-and-correct';
      const price =
        fastest || model === nearFast || model === nearSlow ? 0 : 0.000001;
      models[model] = {
        name: model,
        family: 'qwen3',
        displayName: model,
        displayFamily: fastest ? 'Fixture' : undefined,
        reference: {
          source: 'Fixture',
          url: 'https://example.invalid',
          observedAt: '2026-11-23',
          pricing: {
            inputPerToken: price,
            outputPerToken: price,
          },
          performance: fastest
            ? { timeToFirstTokenMs: latency, outputTokensPerSecond: 'INFINITY' }
            : { responseLatencyMs: latency },
        },
      };
      const directory = path.join(run, 'results', model);
      await mkdir(directory, { recursive: true });
      for (const record of records) {
        const attempt: Result['attempts'][number] = {
          output,
          profiling: {
            startTime:
              (record.testcase.name === 'case-a'
                ? 1795511356984
                : 1795511258465) + (fastest ? 0 : 1_000_000),
            usageStatus: output.type === 'ERROR' ? 'missing' : 'complete',
            snapshotIds: fastest
              ? [`snapshot-${record.testcase.name}`]
              : undefined,
            calls: 1,
            durationMs: latency,
            totalPromptTokens: output.type === 'ERROR' ? undefined : 200,
            totalCompletionTokens: output.type === 'ERROR' ? undefined : 200,
          },
        };
        const result: Result = {
          schemaVersion: 1,
          consistency: { testcaseSha256: record.testcaseSha256 },
          input: {
            testcase: record.testcase.name,
            model,
            family: 'qwen3',
            displayName: model,
            platform: record.testcase.platform,
            instruction: record.testcase.instruction.en,
            groundTruth: record.testcase.groundTruth,
          },
          ...attempt,
          attempts: [attempt],
        };
        await writeFile(
          path.join(directory, `${record.testcase.name}.json`),
          JSON.stringify(result),
        );
      }
    }
    await writeFile(
      path.join(run, 'meta.json'),
      JSON.stringify({
        evaluationId,
        models,
        families: {
          Fixture: {
            color: '#4f6bed',
            logo: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Ccircle%20cx%3D%228%22%20cy%3D%228%22%20r%3D%226%22%20fill%3D%22%234f6bed%22%2F%3E%3C%2Fsvg%3E',
          },
        },
      }),
    );
    await execa(process.execPath, [
      path.resolve(__dirname, '../../bin/midscene'),
      'model',
      'benchmark-grounding',
      'report',
      run,
      '--no-open',
    ]);
    const reportUrl = pathToFileURL(
      path.join(run, `report-${evaluationId}`, 'index.html'),
    );
    const metrics = JSON.parse(
      await readFile(new URL('./metrics.json', reportUrl), 'utf8'),
    );
    expect(metrics).toMatchObject({ schemaVersion: 2, evaluationId });

    const browser = await puppeteer.launch({
      args: buildChromeArgs(),
      pipe: true,
      protocolTimeout: 15_000,
      defaultViewport: { width: 1400, height: 900 },
    });
    try {
      const page = await browser.newPage();
      await page.bringToFront();
      await page.setRequestInterception(true);
      const reportPath = new URL('./', reportUrl).pathname;
      const otherReportAssets: string[] = [];
      const imageRequests: string[] = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (
          url.protocol === 'file:' &&
          url.pathname.startsWith(reportPath) &&
          url.pathname !== reportUrl.pathname
        ) {
          const asset = url.pathname.slice(reportPath.length);
          if (asset.startsWith('screenshots/')) imageRequests.push(asset);
          else otherReportAssets.push(asset);
        }
        if (url.protocol === 'https:') void request.abort();
        else void request.continue();
      });
      await page.goto(`${reportUrl}#/overview`);
      // Check the final capsule geometry independently of compositor timing.
      await page.addStyleTag({
        content: '.scatter-model-label-inner { transition: none !important; }',
      });
      const warning =
        '.model-breakdown button[aria-label="Show observed snapshot IDs"]';
      await page.waitForSelector(warning);
      expect(await page.$eval('h1', (heading) => heading.textContent)).toBe(
        `Midscene Grounding Benchmark - Evaluation ${evaluationId}`,
      );
      expect(otherReportAssets).toEqual([]);
      expect(imageRequests).toEqual([]);
      expect(
        await page.$eval('#benchmark-data', (node) => {
          const { summaries, overview } = JSON.parse(node.textContent!);
          return { summaries, overview };
        }),
      ).toStrictEqual({
        summaries: metrics.summaries,
        overview: metrics.overview,
      });
      expect(
        await page.$eval(
          warning,
          (button) =>
            button.closest('tr')?.querySelector('details')?.textContent,
        ),
      ).toContain('∞ tokens/s');
      const expectModelOrder = async (selector: string) =>
        expect(
          await page.$$eval(selector, (labels) =>
            labels.map((label) => label.textContent),
          ),
        ).toEqual([
          'timed-out',
          'slow-and-incorrect',
          'fast-and-correct',
          foldEndModel,
          foldStartModel,
          nearSlow,
          nearFast,
          costlierTie,
        ]);
      await expectModelOrder('.result-matrix th.matrix-model');
      expect(
        await page.$$eval(
          '.overview-page > section > header :is(h2,h3)',
          (titles) => titles.map((title) => title.textContent),
        ),
      ).toEqual([
        'Model Performance Overview',
        'Testcase Overview',
        'Model Performance Breakdown',
      ]);
      const miniRadar =
        '.performance-model-toggle[aria-label="fast-and-correct"] .performance-mini-radar';
      const radarSvg = `${miniRadar} svg.recharts-surface`;
      await page.waitForSelector(radarSvg);
      const originalWidth = await page.$eval(
        radarSvg,
        (svg) => svg.getBoundingClientRect().width,
      );
      const narrowWidth = 132;
      const originalStyleWidth = await page.$eval(
        miniRadar,
        (radar: HTMLElement, width) => {
          const previousWidth = radar.style.width;
          radar.style.width = `${width}px`;
          return previousWidth;
        },
        narrowWidth,
      );
      const waitForRadarWidth = (width: number) =>
        page.waitForFunction(
          (selector, expectedWidth) => {
            const svg = document.querySelector(selector);
            return (
              svg !== null &&
              Math.abs(svg.getBoundingClientRect().width - expectedWidth) < 1
            );
          },
          {},
          radarSvg,
          width,
        );
      try {
        await waitForRadarWidth(narrowWidth);
        const label = await page.$eval(radarSvg, (svg) => {
          const performance = Array.from(svg.querySelectorAll('text')).find(
            (tick) => tick.textContent === 'Performance',
          );
          if (!performance) throw new Error('Missing Performance radar label');
          const labelBounds = performance.getBoundingClientRect();
          const svgBounds = svg.getBoundingClientRect();
          return {
            width: labelBounds.width,
            left: labelBounds.left - svgBounds.left,
            right: svgBounds.right - labelBounds.right,
          };
        });
        expect(label.width).toBeGreaterThan(0);
        expect(label.left).toBeGreaterThanOrEqual(-0.5);
        expect(label.right).toBeGreaterThanOrEqual(-0.5);
      } finally {
        await page.$eval(
          miniRadar,
          (radar: HTMLElement, width) => {
            radar.style.width = width;
          },
          originalStyleWidth,
        );
        await waitForRadarWidth(originalWidth);
      }
      const tableMetrics = await page.$eval(
        '.model-breakdown-table',
        (table: HTMLTableElement) => {
          const headers = Array.from(table.tHead!.rows[0].cells, (cell) =>
            cell
              .querySelector('.model-breakdown-sort')
              ?.getAttribute('aria-label'),
          );
          const cell = (name: string, label: string) =>
            Array.from(table.tBodies[0].rows).find(
              (row) =>
                row.querySelector('.model-breakdown-name')?.textContent ===
                name,
            )!.cells[headers.indexOf(label)];
          return {
            primaryColumns: headers.slice(0, 5),
            inlineHelp: ['Performance', 'Economy', 'Balance'].map((metric) => {
              const header =
                table.tHead!.rows[0].cells[headers.indexOf(metric)];
              const label = Array.from(header.querySelectorAll('span')).find(
                (span) =>
                  !span.firstElementChild && span.textContent === metric,
              );
              const help = header.querySelector(
                `button[aria-label="How ${metric} Is Calculated"]`,
              );
              const arrow = header.querySelector('.model-breakdown-sort-icon');
              if (!label || !help || !arrow)
                throw new Error(`Missing header controls for ${metric}`);
              const [text, button, icon] = [label, help, arrow].map((node) =>
                node.getBoundingClientRect(),
              );
              return {
                metric,
                sameLine:
                  Math.max(text.top, button.top, icon.top) <
                  Math.min(text.bottom, button.bottom, icon.bottom),
                inOrder: text.right <= button.left && button.right <= icon.left,
              };
            }),
            fastest: Object.fromEntries(
              ['Accuracy', 'Performance', 'Economy', 'Balance'].map((label) => [
                label,
                cell('fast-and-correct', label).firstChild?.textContent,
              ]),
            ),
            paid: cell('slow-and-incorrect', 'Economy').firstChild?.textContent,
            unavailable: cell('timed-out', 'Economy').firstChild?.textContent,
            unavailableCoverage: cell('timed-out', 'Economy').querySelector(
              'small',
            )?.textContent,
            hasCostColumn: headers.includes('Cost Avg.'),
          };
        },
      );
      expect(tableMetrics).toEqual({
        primaryColumns: [
          'Model',
          'Accuracy',
          'Performance',
          'Economy',
          'Balance',
        ],
        inlineHelp: ['Performance', 'Economy', 'Balance'].map((metric) => ({
          metric,
          sameLine: true,
          inOrder: true,
        })),
        fastest: {
          Accuracy: '100.0%',
          Performance: '1.00 s',
          Economy: 'Free ($0)',
          Balance: '100.0',
        },
        paid: '2,500 cases / $1',
        unavailable: '—',
        unavailableCoverage: '0 / 2 valid results',
        hasCostColumn: false,
      });
      expect(await page.$$(warning)).toHaveLength(1);
      expect(
        await page.$eval(
          warning,
          (button) => button.closest('small')?.firstChild?.textContent,
        ),
      ).toBe('snapshot-case-a');
      expect(
        await page.$eval(
          warning,
          (button) => button.closest('small')?.nextElementSibling?.textContent,
        ),
      ).toBe(
        await page.evaluate(() => {
          const localTime = new Intl.DateTimeFormat('sv-SE', {
            dateStyle: 'short',
            timeStyle: 'medium',
            hourCycle: 'h23',
          });
          return [1795511258465, 1795511356984]
            .map((time) => localTime.format(time))
            .join(' ~ ');
        }),
      );
      await page.focus(warning);
      const snapshotTooltip = await page.$eval(
        warning,
        (button) =>
          `#${CSS.escape(button.getAttribute('aria-describedby')!)}:popover-open`,
      );
      await page.waitForSelector(snapshotTooltip);
      expect(
        await page.$$eval(`${snapshotTooltip} span`, (items) =>
          items.map((item) => item.textContent),
        ),
      ).toEqual(['snapshot-case-a', 'snapshot-case-b']);
      await page.waitForSelector('.matrix-cell.error');
      expect(
        await page.$eval('.matrix-cell.error', (cell) => cell.textContent),
      ).toBe('!');
      expect(
        await page.$eval('.matrix-cell.failed', (cell) => cell.textContent),
      ).toBe('×');
      const expectPerformanceHelp = async (target: typeof page) => {
        const button =
          '.performance-axis-title button[aria-label="How Performance Is Calculated"]';
        const tooltip = '.performance-axis-title [role="tooltip"]:popover-open';
        await target.waitForSelector(button);
        await target.focus(button);
        await target.waitForSelector(tooltip, { visible: true });
        expect(
          await target.$eval(`${tooltip} strong`, (node) => node.textContent),
        ).toBe('Performance');
        expect(
          await target.$eval(tooltip, (node) => node.textContent),
        ).toContain('Performance = min');
        await target.$eval(button, (node) => (node as HTMLElement).blur());
      };
      await expectPerformanceHelp(page);
      const expectAccuracyHelp = async (target: typeof page) => {
        const button =
          '.accuracy-axis-title button[aria-label="How Accuracy Is Calculated"]';
        const tooltip = '.accuracy-axis-title [role="tooltip"]:popover-open';
        await target.waitForSelector(button);
        await target.hover(button);
        await target.waitForSelector(tooltip, { visible: true });
        await target.mouse.move(0, 0);
        await target.waitForSelector(tooltip, { hidden: true });
        await target.focus(button);
        await target.waitForSelector(tooltip, { visible: true });
        const help = await target.$eval(tooltip, (node) =>
          node.textContent.replace(/\s+/g, ' '),
        );
        expect(help).toContain(
          'percentage of test cases the model answers correctly',
        );
        expect(help).not.toContain('Avg.');
        await target.$eval(button, (node) => (node as HTMLElement).blur());
      };
      await expectAccuracyHelp(page);
      const readDot = async (model: string) => {
        const selector = `[data-model="${model}"] .scatter-model-dot`;
        await page.waitForSelector(selector);
        return page.$eval(selector, (dot) => ({
          x: Number(dot.getAttribute('cx')),
          y: Number(dot.getAttribute('cy')),
        }));
      };
      const fast = await readDot('fast-and-correct');
      const slow = await readDot('slow-and-incorrect');
      const axis = await page.$eval(
        '.recharts-xAxis .recharts-cartesian-axis-line',
        (line) => ({
          left: Number(line.getAttribute('x1')),
          right: Number(line.getAttribute('x2')),
        }),
      );
      expect(fast.x).toBeLessThan(slow.x);
      expect(fast.y).toBeLessThan(slow.y);
      const foldSelector = '.performance-axis-breaks [data-break-start]';
      await page.waitForSelector(foldSelector);
      expect(
        await page.$$eval(foldSelector, (folds) =>
          folds.map((fold) => ({
            start: Number(fold.getAttribute('data-break-start')),
            end: Number(fold.getAttribute('data-break-end')),
            width: Math.round(
              Number(fold.querySelector('rect')?.getAttribute('width')),
            ),
          })),
        ),
      ).toEqual([
        { start: 1.75, end: 3.003, width: 65 },
        { start: 3.003, end: 3.643, width: 45 },
      ]);
      const badgeSelector = 'image.scatter-model-badge[data-badge]';
      const capsuleExtents = await page.$$eval(
        '.model-scatter-plot [data-model]',
        (markers, selector) =>
          markers.map((marker) => {
            const dot =
              marker.querySelector<SVGCircleElement>('.scatter-model-dot')!;
            const rect = marker.querySelector<SVGRectElement>(
              '.scatter-model-label rect',
            )!;
            const x = dot.cx.baseVal.value;
            const halfWidth = (rect.width.baseVal.value * 1.12) / 2;
            const pill = rect.getBoundingClientRect();
            const badge = marker
              .querySelector(selector)
              ?.getBoundingClientRect();
            const badgeOverhang = Math.max(
              0,
              pill.left - (badge?.left ?? pill.left),
            );
            return {
              model: marker.getAttribute('data-model'),
              pillLeft: x - halfWidth,
              left: x - halfWidth - badgeOverhang * 1.12,
              right: x + halfWidth,
            };
          }),
        badgeSelector,
      );
      const leftmost = capsuleExtents.reduce((a, b) =>
        a.left < b.left ? a : b,
      );
      const rightmost = capsuleExtents.reduce((a, b) =>
        a.right > b.right ? a : b,
      );
      expect(
        capsuleExtents.reduce((a, b) => (a.pillLeft < b.pillLeft ? a : b))
          .model,
      ).toBe(nearFast);
      expect(rightmost.model).toBe(nearSlow);
      expect(leftmost.left - axis.left).toBeGreaterThanOrEqual(1.9);
      expect(leftmost.left - axis.left).toBeLessThan(3.1);
      expect(axis.right - rightmost.right).toBeGreaterThanOrEqual(1.9);
      expect(axis.right - rightmost.right).toBeLessThan(3.1);
      expect(
        await page.$eval('.accuracy-reference-label', (label) => {
          const svg = (label as SVGTextElement).ownerSVGElement!;
          const line = [
            ...svg.querySelectorAll('.recharts-reference-line line'),
          ].find(
            (line) => line.getAttribute('y1') === line.getAttribute('y2'),
          )!;
          const text = label.getBoundingClientRect();
          const reference = line.getBoundingClientRect();
          return {
            outside: text.left > reference.right,
            withinChart: text.right < svg.getBoundingClientRect().right,
            centered: Math.abs(text.top + text.height / 2 - reference.top) < 1,
            vertical: text.height > text.width,
          };
        }),
      ).toEqual({
        outside: true,
        withinChart: true,
        centered: true,
        vertical: true,
      });
      expect(
        await page.$$eval('.recharts-yAxis-tick-labels text', (ticks) =>
          ticks.map((tick) => tick.textContent),
        ),
      ).toEqual(expect.arrayContaining(['0', '100']));
      expect(await page.$('.accuracy-axis-breaks')).toBeNull();
      const baseOrder = [
        'slow-and-incorrect',
        foldStartModel,
        nearFast,
        nearSlow,
        foldEndModel,
        costlierTie,
        'fast-and-correct',
      ];
      const readPaintOrder = () =>
        page.$$eval('.model-scatter-plot [data-model]', (groups) =>
          groups.map((group) => group.getAttribute('data-model')),
        );
      expect(await readPaintOrder()).toEqual(baseOrder);

      const fastestMarker = '[data-model="fast-and-correct"]';
      const slowMarker = '[data-model="slow-and-incorrect"]';
      const budgetSlider = 'input[aria-label="Cases to Run Within $1"]';
      await page.$eval(budgetSlider, (slider: HTMLInputElement) =>
        slider.focus({ preventScroll: true }),
      );
      await page.keyboard.press('End');
      await page.waitForSelector(`${slowMarker}[data-matches-filters="false"]`);
      expect(
        await page.$(`${fastestMarker}[data-matches-filters="true"]`),
      ).not.toBeNull();
      await page.keyboard.press('Home');
      await page.waitForSelector(`${slowMarker}[data-matches-filters="true"]`);
      await page.$eval(budgetSlider, (slider: HTMLInputElement) =>
        slider.blur(),
      );

      const toggleModel = (model: string) =>
        page.$eval(
          `button.performance-model-toggle[aria-label="${model}"]`,
          (button) => button.click(),
        );
      await toggleModel(foldStartModel);
      await page.waitForSelector(
        `${fastestMarker}[data-matches-filters="false"]`,
      );
      await toggleModel(costlierTie);
      await page.waitForSelector(
        `[data-model="${costlierTie}"][data-matches-filters="true"]`,
      );
      const matchingModels = [foldStartModel, costlierTie];
      expect(await readPaintOrder()).toEqual([
        ...baseOrder.filter((model) => !matchingModels.includes(model)),
        ...baseOrder.filter((model) => matchingModels.includes(model)),
      ]);
      await page.$eval('.model-filters-heading button', (button) =>
        button.click(),
      );
      await page.waitForSelector(
        `${fastestMarker}[data-matches-filters="true"]`,
      );
      expect(await readPaintOrder()).toEqual(baseOrder);

      expect(
        await page.$$eval(`.model-scatter-plot ${badgeSelector}`, (badges) =>
          badges.map(
            (badge) =>
              `${badge.closest('[data-model]')?.getAttribute('data-model')}:${badge.getAttribute('data-badge')}`,
          ),
        ),
      ).toEqual(['fast-and-correct:performance']);
      expect(
        await page.$eval(`${fastestMarker} ${badgeSelector}`, (badge) => {
          const center = (box: DOMRect) => ({
            x: box.left + box.width / 2,
            y: box.top + box.height / 2,
            radius: box.width / 2,
          });
          const marker = badge.closest('[data-model]')!;
          const bounds = badge.getBoundingClientRect();
          const { x, y, radius } = center(bounds);
          const chart = marker.closest('svg')!.getBoundingClientRect();
          const pill = marker
            .querySelector('.scatter-model-label-inner rect')!
            .getBoundingClientRect();
          const brand = center(
            marker
              .querySelector('.scatter-model-label circle')!
              .getBoundingClientRect(),
          );
          return {
            selfContained: badge
              .getAttribute('href')
              ?.startsWith('data:image/svg+xml'),
            atCorner:
              Math.abs(x - pill.left) <= 2 && Math.abs(y - pill.top) <= 2,
            withinChart:
              bounds.left >= chart.left &&
              bounds.right <= chart.right &&
              bounds.top >= chart.top &&
              bounds.bottom <= chart.bottom,
            brandClear:
              Math.hypot(brand.x - x, brand.y - y) >= brand.radius + radius,
          };
        }),
      ).toEqual({
        selfContained: true,
        atCorner: true,
        withinChart: true,
        brandClear: true,
      });

      const dot = `${fastestMarker} .scatter-model-dot`;
      const slowCapsule =
        '[data-model="slow-and-incorrect"] .scatter-model-label';
      const tooltipTitle = '.performance-tooltip strong';
      const hoverModel = async (selector: string) => {
        const { x, y } = await page.$eval(selector, (target) => {
          target.scrollIntoView({ block: 'center', inline: 'nearest' });
          const box = target.getBoundingClientRect();
          return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        });
        await page.mouse.move(x, y);
        return { x, y };
      };
      const readCapsule = (selector: string) =>
        page.$eval(selector, (label) => {
          const rect = label.querySelector('rect')!;
          const box = rect.getBoundingClientRect();
          const model = label.closest('[data-model]')!;
          const connector = model.querySelector<SVGLineElement>(
            '.scatter-model-connector',
          )!;
          const dot =
            model.querySelector<SVGCircleElement>('.scatter-model-dot')!;
          return {
            width: box.width,
            intrinsicWidth: rect.width.baseVal.value,
            vertical: connector.x1.baseVal.value === connector.x2.baseVal.value,
            centered:
              connector.x1.baseVal.value === dot.cx.baseVal.value &&
              Math.abs(
                connector.y1.baseVal.value -
                  dot.cy.baseVal.value -
                  dot.r.baseVal.value,
              ) < 0.01 &&
              Math.abs(
                connector.getBoundingClientRect().x -
                  (box.left + box.width / 2),
              ) <= 1,
          };
        });
      for (const [selector, model, padding, balance] of [
        [dot, 'fast-and-correct', fast.x - axis.left, '100.0'],
        [slowCapsule, 'slow-and-incorrect', axis.right - slow.x, '0.0'],
        [
          `[data-model="${nearFast}"] .scatter-model-dot`,
          nearFast,
          fast.x - axis.left,
          '33.3',
        ],
      ] as const) {
        await page.mouse.move(0, 0);
        await page.waitForSelector(tooltipTitle, { hidden: true });
        const capsule = `[data-model="${model}"] .scatter-model-label-inner`;
        const resting = await readCapsule(capsule);
        expect(resting.width).toBeCloseTo(resting.intrinsicWidth, 1);
        expect(resting).toMatchObject({ vertical: true, centered: true });
        await hoverModel(selector);
        await page.waitForSelector(tooltipTitle, { visible: true });
        expect(
          await page.$eval(tooltipTitle, (title) => title.textContent),
        ).toBe(model);
        const hovered = await readCapsule(capsule);
        expect(hovered.width).toBeGreaterThan(resting.width);
        expect(await readPaintOrder()).toEqual(baseOrder);
        expect(
          await page.$eval('.scatter-hovered-mark', (marker) => {
            const id = marker.getAttribute('href')?.slice(1);
            return id
              ? document
                  .getElementById(id)
                  ?.closest('[data-model]')
                  ?.getAttribute('data-model')
              : null;
          }),
        ).toBe(model);
        expect(hovered).toMatchObject({
          vertical: true,
          centered: true,
        });
        expect(padding).toBeGreaterThanOrEqual(hovered.width / 2 - 0.5);
        const winsAllMetrics = model === 'fast-and-correct';
        expect(
          await page.$$eval('.performance-tooltip dt', (labels) => ({
            rows: labels.map((label) => [
              label.textContent,
              label.parentElement
                ?.querySelector('img[data-badge]')
                ?.getAttribute('data-badge') ?? null,
            ]),
            balance: labels.at(-1)?.nextElementSibling?.textContent,
          })),
        ).toEqual({
          rows: [
            ['Accuracy', winsAllMetrics ? 'accuracy' : null],
            ['Performance', winsAllMetrics ? 'performance' : null],
            ['Economy', winsAllMetrics ? 'economy' : null],
            ['Balance', winsAllMetrics ? 'balance' : null],
          ],
          balance,
        });
      }

      await hoverModel(dot);
      await page.waitForSelector(tooltipTitle, { visible: true });
      await page.mouse.down();
      const blank = await page.$eval('.model-scatter-plot', (plot) => {
        const box = plot.getBoundingClientRect();
        return { x: box.left + 6, y: box.top + box.height / 2 };
      });
      await page.mouse.move(blank.x, blank.y);
      await page.mouse.up();
      await page.waitForSelector(tooltipTitle, { hidden: true });

      const hasFocusOutline = () =>
        page.$eval('.model-scatter-plot', (plot) => {
          const active = document.activeElement;
          if (!active?.matches('.scatter-model-link') || !plot.contains(active))
            return false;
          const { outlineStyle, outlineWidth } = getComputedStyle(active);
          return outlineStyle !== 'none' && Number.parseFloat(outlineWidth) > 0;
        });
      const openModel = async (selector: string, model: string) => {
        const detailHash = await page.$eval(selector, (element) =>
          element.closest('a')?.getAttribute('href'),
        );
        const { x, y } = await hoverModel(selector);
        expect(
          await page.evaluate(
            (left, top) =>
              document
                .elementFromPoint(left, top)
                ?.closest('a[data-model]')
                ?.getAttribute('data-model'),
            x,
            y,
          ),
        ).toBe(model);
        await page.mouse.click(x, y);
        await page.waitForFunction(
          (hash) => location.hash === hash,
          {
            polling: 50,
            timeout: 5000,
          },
          detailHash,
        );
        await page.waitForSelector('#case-name', { visible: true });
        expect(new URL(page.url()).hash).toBe(detailHash);
        expect(
          await page.$eval('#case-name', (heading) => heading.textContent),
        ).toBe(records[0].testcase.name);
        expect(
          await page.$eval(
            '[aria-label="Model results"] [aria-current="true"] > span',
            (selected) => selected.textContent,
          ),
        ).toBe(model);
      };
      await page.mouse.move(0, 0);
      await page.waitForSelector(tooltipTitle, { hidden: true });
      expect(await readPaintOrder()).toEqual(baseOrder);
      await page.$eval('.model-scatter-plot .recharts-surface', (surface) =>
        (surface as SVGElement).focus(),
      );
      for (let tab = 0; tab < 20 && !(await hasFocusOutline()); tab++) {
        await page.keyboard.press('Tab');
      }
      expect(await hasFocusOutline()).toBe(true);
      await page.waitForSelector(tooltipTitle, { visible: true });
      await hoverModel(dot);
      await page.mouse.down();
      expect(await hasFocusOutline()).toBe(false);
      await page.mouse.move(blank.x, blank.y);
      await page.mouse.up();
      await openModel(dot, 'fast-and-correct');
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.evaluation-section dl dd')].some(
          (field) => field.textContent === 'snapshot-case-a',
        ),
      );
      await page.waitForFunction(() =>
        Array.from(document.images).some(
          (image) =>
            image.getAttribute('src')?.startsWith('screenshots/') &&
            image.naturalWidth > 0,
        ),
      );
      expect(
        imageRequests.some((file) =>
          file.includes(records[0].testcase.reference.image.sha256),
        ),
      ).toBe(true);
      await page.goBack();
      await page.waitForSelector(slowCapsule, { visible: true });
      expect(new URL(page.url()).hash).toBe('#/overview');
      await openModel(slowCapsule, 'slow-and-incorrect');
      await page.goBack();

      const link = '.model-breakdown-name[href$="model=slow-and-incorrect"]';
      expect(await page.$eval(link, (node) => node.textContent)).toBe(
        'slow-and-incorrect',
      );
      expect(
        await page.$eval(link, (node) => node.nextElementSibling?.textContent),
      ).toBe('N/A');
      await page.click(link);
      await page.waitForSelector('#case-name', { visible: true });
      expect(new URL(page.url()).hash).toBe(
        '#/testcases/case-a?model=slow-and-incorrect',
      );
      expect(await page.$('dialog[open]')).toBeNull();
      await expectModelOrder('.case-model-option > span:first-child');
      await page.goBack();

      const detailsButton =
        '.matrix-cell[aria-label^="case-b · slow-and-incorrect ·"]';
      await page.click(detailsButton);
      const dialog = 'dialog[open]';
      const currentModel = `${dialog} [aria-label="Model results"] [aria-current="true"] > span`;
      await page.waitForSelector(currentModel, { visible: true });
      await expectModelOrder(`${dialog} .case-model-option > span:first-child`);
      expect(new URL(page.url()).hash).toBe('#/overview');
      expect(await page.$eval(currentModel, (node) => node.textContent)).toBe(
        'slow-and-incorrect',
      );
      expect(
        await page.$eval(`${dialog} #case-name`, (node) => node.textContent),
      ).toBe(records[1].testcase.name);
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(
        (selector) =>
          document.querySelector(selector)?.textContent === 'fast-and-correct',
        {},
        currentModel,
      );
      const caseSnapshot = `${dialog} .evaluation-section > dl dd`;
      await page.waitForFunction(
        (selector) =>
          Array.from(document.querySelectorAll(selector)).some(
            (field) => field.textContent === 'snapshot-case-b',
          ),
        {},
        caseSnapshot,
      );
      expect(
        await page.$$eval(
          caseSnapshot,
          (fields) =>
            fields.find(
              (field) =>
                field.previousElementSibling?.textContent === 'Snapshot ID',
            )?.textContent,
        ),
      ).toBe('snapshot-case-b');
      await page.keyboard.press('ArrowUp');
      await page.waitForFunction(
        (selector) =>
          Array.from(document.querySelectorAll(selector)).some(
            (field) => field.textContent === 'snapshot-case-a',
          ),
        {},
        caseSnapshot,
      );
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(
        (selector) =>
          document.querySelector(selector)?.textContent ===
          'slow-and-incorrect',
        {},
        currentModel,
      );
      await page.keyboard.press('Escape');
      await page.waitForSelector(dialog, { hidden: true });
      expect(new URL(page.url()).hash).toBe('#/overview');
      expect(
        await page.$eval(
          detailsButton,
          (button) => button === document.activeElement,
        ),
      ).toBe(true);
      await page.click('.matrix-case-link');
      await page.waitForSelector(currentModel, { visible: true });
      expect(
        await page.$eval(`${dialog} #case-name`, (node) => node.textContent),
      ).toBe('case-a');
      expect(new URL(page.url()).hash).toBe('#/overview');
      await page.click(`${dialog} button[type="submit"]`);
      await page.waitForSelector(dialog, { hidden: true });
      expect(otherReportAssets).toEqual([]);

      const balanceSort = '.model-breakdown-table button[aria-label="Balance"]';
      await page.click(balanceSort);
      await page.waitForFunction(
        (selector) =>
          document
            .querySelector(selector)
            ?.closest('th')
            ?.getAttribute('aria-sort') === 'descending',
        {},
        balanceSort,
      );
      const balanceRows = await page.$eval(balanceSort, (button) => {
        const index = button.closest('th')!.cellIndex;
        return Array.from(button.closest('table')!.tBodies[0].rows, (row) => [
          row.querySelector('.model-breakdown-name')!.textContent,
          row.cells[index].textContent,
        ]);
      });
      expect(Object.fromEntries(balanceRows)).toMatchObject({
        'fast-and-correct': '100.0',
        [nearFast]: '33.3',
        'slow-and-incorrect': '0.0',
      });
      expect(balanceRows.at(-1)).toEqual(['timed-out', '—']);
      const balanceValues = balanceRows
        .slice(0, -1)
        .map(([, balance]) => Number(balance));
      expect(balanceValues).toEqual([...balanceValues].sort((a, b) => b - a));

      const balanceHelp =
        '.model-breakdown-table button[aria-label="How Balance Is Calculated"]';
      await page.click(balanceHelp);
      const balanceHelpTooltip = await page.$eval(
        balanceHelp,
        (button) =>
          `#${CSS.escape(button.getAttribute('aria-describedby')!)}:popover-open`,
      );
      await page.waitForSelector(balanceHelpTooltip, { visible: true });
      const balanceHelpText = await page.$eval(balanceHelpTooltip, (help) =>
        help.textContent.replace(/\s+/g, ' '),
      );
      expect(balanceHelpText).toContain(
        'Balance = (x × y + y × z + z × x) ÷ 300',
      );
      expect(balanceHelpText).toContain('Accuracy, Performance, and Economy');

      const brief = await browser.newPage();
      await brief.setViewport({ width: 375, height: 800 });
      await brief.bringToFront();
      await brief.goto(new URL('./brief.html', reportUrl).href);
      expect(
        await brief.$eval(
          '#benchmark-data',
          (node) => JSON.parse(node.textContent!).scatter,
        ),
      ).toStrictEqual(metrics.overview.chart.scatter);
      const briefMarker = '.model-scatter-brief a.scatter-model-link';
      await brief.waitForSelector(briefMarker);
      expect(await brief.$$(briefMarker)).toHaveLength(outcomes.length - 1);
      const briefViewport = await brief.$eval(
        '.model-scatter-brief',
        (chart) => {
          const { x, y, width, height } = chart.getBoundingClientRect();
          const scrollTargets = [
            document.scrollingElement!,
            document.body,
            chart.parentElement!,
            chart,
            chart.querySelector('.model-scatter-plot')!,
          ];
          window.scrollTo(100, 100);
          for (const element of scrollTargets) element.scrollTo(100, 100);
          return {
            bounds: [x, y, width, height],
            windowScroll: [window.scrollX, window.scrollY],
            elementScroll: scrollTargets.map((element) => [
              element.scrollLeft,
              element.scrollTop,
            ]),
          };
        },
      );
      expect(briefViewport.bounds).toEqual([0, 0, 375, 800]);
      expect(briefViewport.windowScroll).toEqual([0, 0]);
      expect(briefViewport.elementScroll).toEqual(
        Array.from({ length: 5 }, () => [0, 0]),
      );
      const nestedScrollbars = await brief.$eval(
        '.model-scatter-brief',
        (chart) => {
          const scroller = document.createElement('div');
          scroller.style.cssText =
            'position:absolute;top:0;left:0;width:96px;height:64px;overflow:scroll;scrollbar-width:auto;scrollbar-gutter:stable both-edges';
          const content = document.createElement('div');
          content.style.cssText = 'width:192px;height:128px';
          scroller.append(content);
          chart.querySelector('.recharts-wrapper')!.append(scroller);
          try {
            return {
              clientSize: [scroller.clientWidth, scroller.clientHeight],
              contentSize: [scroller.scrollWidth, scroller.scrollHeight],
              gutter:
                getComputedStyle(scroller).getPropertyValue('scrollbar-gutter'),
              scrollbars: [document.documentElement, chart, scroller].map(
                (element) => [
                  getComputedStyle(element).getPropertyValue('scrollbar-width'),
                  getComputedStyle(element, '::-webkit-scrollbar').display,
                ],
              ),
            };
          } finally {
            scroller.remove();
          }
        },
      );
      expect(nestedScrollbars).toEqual({
        clientSize: [96, 64],
        contentSize: [192, 128],
        gutter: 'auto',
        scrollbars: Array.from({ length: 3 }, () => ['none', 'none']),
      });
      const clippedModels = await brief.$$eval(briefMarker, (models) =>
        models
          .filter((model) => {
            const bounds = model
              .querySelector('.scatter-model-label-inner rect')
              ?.getBoundingClientRect();
            return (
              !bounds ||
              bounds.width <= 0 ||
              bounds.height <= 0 ||
              bounds.left < -1 ||
              bounds.top < -1 ||
              bounds.right > window.innerWidth + 1 ||
              bounds.bottom > window.innerHeight + 1
            );
          })
          .map((model) => model.getAttribute('data-model')),
      );
      expect(clippedModels).toEqual([]);
      expect(
        await brief.$$(
          '.page-navigation, .model-performance-models, .result-matrix, .model-breakdown',
        ),
      ).toHaveLength(0);
      const readCapsules = (target: typeof page, selector: string) =>
        target.$$eval(selector, (markers) =>
          markers.map((marker) => {
            const capsule = marker.querySelector('.scatter-model-label');
            return {
              model: marker.getAttribute('data-model'),
              label: capsule?.querySelector('text')?.textContent,
              logo: capsule
                ?.querySelector('image:not([data-badge])')
                ?.getAttribute('href'),
              badge: capsule
                ?.querySelector('[data-badge]')
                ?.getAttribute('data-badge'),
            };
          }),
        );
      const briefCapsules = await readCapsules(brief, briefMarker);
      expect(briefCapsules.every(({ label }) => Boolean(label))).toBe(true);
      expect(briefCapsules).toEqual(
        await readCapsules(page, '.model-scatter-plot a.scatter-model-link'),
      );
      const readFolds = (target: typeof page) =>
        target.$$eval(foldSelector, (folds) =>
          folds.map((fold) => [
            fold.getAttribute('data-break-start'),
            fold.getAttribute('data-break-end'),
          ]),
        );
      expect(await readFolds(brief)).toEqual(await readFolds(page));
      await expectPerformanceHelp(brief);
      await expectAccuracyHelp(brief);

      const briefModel = 'fast-and-correct';
      const focusedModels: string[] = [];
      while (focusedModels.length < outcomes.length * 3) {
        await brief.keyboard.press('Tab');
        const focused = await brief.evaluate(
          () => document.activeElement?.getAttribute('data-model') ?? '',
        );
        focusedModels.push(focused);
        if (focused === briefModel) break;
      }
      expect(focusedModels).toContain(briefModel);
      const briefTooltip = '.model-scatter-brief .performance-tooltip';
      await brief.waitForSelector(briefTooltip, { visible: true });
      expect(
        await brief.$eval(`${briefTooltip} strong`, (node) => node.textContent),
      ).toBe(briefModel);
      expect(
        await brief.$$eval(`${briefTooltip} dt`, (labels) =>
          labels.map((label) => label.textContent),
        ),
      ).toEqual(['Accuracy', 'Performance', 'Economy', 'Balance']);
      expect(
        await brief.$eval(`${briefTooltip} dl`, (node) => node.textContent),
      ).toContain('Free ($0)');
      expect(
        await brief.$eval(briefTooltip, (node) => node.textContent),
      ).toContain(costlierTie);
      const detailsUrl = `${reportUrl}#/testcases/case-a?model=${briefModel}`;
      const [target] = await Promise.all([
        browser.waitForTarget((target) => target.url() === detailsUrl),
        brief.keyboard.press('Enter'),
      ]);
      const details = await target.page();
      await details?.waitForSelector('.case-detail');
      expect(details?.url()).toBe(detailsUrl);
    } finally {
      await browser.close();
    }
  } finally {
    await rm(run, { recursive: true, force: true });
  }
});
