# Consume Report Files

Midscene HTML report files capture the full execution history of a single Agent, making them useful for replay and debugging.

Starting in v1.7.0, you can extract raw screenshots and JSON data from a report file, or convert the report into Markdown so other tools can consume it.

## Example

You can parse a report file into a Markdown file like this:

```md
# Act - Search for and play videos related to Midscene

- Execution start: 2026-04-08T02:13:04.795Z
- Task count: 21

## 1. Plan - Click the top search box to activate input
- Status: finished
- Start: 2026-04-08T02:13:04.845Z
- End: 2026-04-08T02:13:15.296Z
- Cost(ms): 10451
- Screen size: 2880 x 1536

![task-1](./screenshots/execution-1-task-1-f9fc3bf9-bdf6-48dd-abea-f8f29874d8c1.jpeg)

### Recorder
- #1 type=screenshot, ts=2026-04-08T02:13:15.296Z, timing=after-calling

![task-1](./screenshots/execution-1-task-1-c521b130-5037-4ed2-b70f-705e181d981a.jpeg)

## 2. Locate - The search input with the placeholder text "Li Weigang's Daily Life" at the top
- Status: finished
- Start: 2026-04-08T02:13:15.305Z
- End: 2026-04-08T02:13:15.306Z
- Cost(ms): 1
- Screen size: 2880 x 1536
- Locate center: (1489, 71)

.....
```

You can then combine it with the [Remotion Skill](https://www.remotion.dev/docs/ai/skills?utm_source=midscenejs) to parse the Markdown file and generate a customized replay video.

The generated video looks like this:

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/midscene-replay.mp4" height="300" controls></video>

## Parse With The CLI

The report parsing tool is included in each platform CLI package, such as `@midscene/web` and `@midscene/android`. The subcommand is `report-tool`.

Extract report contents as JSON and export the related screenshots into the `output-data` directory:

```shell
npx @midscene/web report-tool --action split --htmlPath ./midscene_run/report/puppeteer-2026/index.html --outputDir ./output-data
```

Convert the report file into Markdown and write the result into the `output-markdown` directory:

```shell
npx @midscene/web report-tool --action to-markdown --htmlPath ./midscene_run/report/puppeteer-2026/index.html --outputDir ./output-markdown
```

Merge multiple report files into a single combined report:

```shell
npx @midscene/web report-tool --action merge-html \
  --htmlReport ./midscene_run/report/case-a/index.html \
  --htmlReport ./midscene_run/report/case-b.html \
  --outputDir ./merged --outputName all-cases
```

Repeat `--htmlReport` once per source report. `--outputDir` and `--outputName` are optional; when omitted, the merged file is written to the default Midscene report directory with an auto-generated name. Pass `--overwrite` to replace an existing merged file.

Export successful operations as an Action Manifest:

```shell
npx @midscene/web analyze ./midscene_run/report/puppeteer-2026/index.html --outputDir ./recorded-actions
```

The command writes one `*.actions.yaml` file. Each device operation whose Action task finished becomes one manifest entry. Recorded XPath cache data is exported as `target`; actions without a stable target keep `locatedPixelBbox` as a fallback. If an action has multiple targets, such as a `Swipe` with `start` and `end`, all targets remain in the action parameters and the first target becomes `validWhenTargetExists`. A finished Action does not prove that it was part of the correct business path, so review recovery detours and mistaken clicks before treating an exported manifest as a reusable asset. Pass `--overwrite` to replace an existing manifest.

## Parse With The JavaScript SDK

If you prefer to control report parsing in code, use `splitReportFile`, `reportFileToMarkdown`, and `mergeReportFiles` from `@midscene/core`.

```ts
import {
  analyzeReportActions,
  mergeReportFiles,
  reportFileToMarkdown,
  splitReportFile,
} from '@midscene/core';

const actionManifest = analyzeReportActions({
  htmlPath: './midscene_run/report/puppeteer-2026/index.html',
  outputDir: './recorded-actions',
});
console.log(actionManifest.actionFiles);

const splitResult = splitReportFile({
  htmlPath: './midscene_run/report/puppeteer-2026/index.html',
  outputDir: './output-data',
});
console.log(splitResult.executionJsonFiles);

const markdownResult = await reportFileToMarkdown({
  htmlPath: './midscene_run/report/puppeteer-2026/index.html',
  outputDir: './output-markdown',
});
console.log(markdownResult.markdownFiles);

const mergedResult = mergeReportFiles({
  htmlPaths: [
    './midscene_run/report/case-a/index.html',
    './midscene_run/report/case-b.html',
  ],
  outputDir: './merged',
  outputName: 'all-cases',
});
console.log(mergedResult.mergedReportPath);
```

`analyzeReportActions`, `splitReportFile`, `reportFileToMarkdown`, and `mergeReportFiles` serve different outputs:

- `analyzeReportActions` exports successful device operations as one `*.actions.yaml` manifest that can be loaded with `aiAct({ loadExtraActions })`. Every report dump that contains executions must declare the same `manifestInterface`; mixed-platform reports are rejected instead of assigning the wrong platform to an action.
- `splitReportFile` generates JSON files for the original structured objects (one `*.execution.json` per execution). The JSON keeps the raw `ReportActionDump`-style data and exports screenshots alongside it. The returned `executionJsonFiles` and `screenshotFiles` are lists of generated file paths.
- `reportFileToMarkdown` converts the same report into human-readable Markdown and exports the screenshots referenced by that Markdown. The returned `markdownFiles` contains the generated Markdown file paths.
- `mergeReportFiles` combines several report files into one merged HTML report. It is a thin wrapper over [`ReportMergingTool`](./reference/#new-reportmergingtool) that derives `testTitle`/`testDescription` from each source report's `groupName` automatically. Use it when you run multiple CLI actions or tests and want to consolidate their reports.


## About Fields In JSON And Markdown

The parsed JSON and Markdown structures may change as Midscene evolves. Use the actual conversion result as the source of truth.
