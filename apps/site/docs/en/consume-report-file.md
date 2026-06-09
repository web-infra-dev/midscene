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

## Generate A Replay Video From The CLI

The report viewer has an "Export video" button that renders the replay as a `.webm` file. The `report-video` subcommand of `@midscene/cli` produces the replay video from the command line, without opening the report in a browser — handy for CI or batch jobs. It drives a headless browser internally and encodes frames with the bundled `@ffmpeg-installer/ffmpeg` binary by default, so it ships only in `@midscene/cli` (not in the per-platform CLIs).

Generate a video from an existing report HTML. Directory-mode reports generated with `html-and-external-assets` are also supported; pass either the report directory or its `index.html`:

```shell
npx @midscene/cli report-video --input ./midscene_run/report/puppeteer-2026/index.html --output ./videos --name my-replay
```

You can also pass a dump JSON file instead of an HTML report:

```shell
npx @midscene/cli report-video --input ./output-data/some.execution.json --output ./videos
```

Options:

- `--input, -i`: report HTML (file or directory) or a dump JSON file. Required.
- `--output, -o`: output directory. Defaults to the Midscene report directory.
- `--name`: output file name without extension. Defaults to `midscene_replay`.
- `--index`: which dump group to render for a multi-group report. Defaults to `0`.
- `--encoder`: `ffmpeg` (default) or `media-recorder`. The ffmpeg encoder renders frames offline and supports long replays more reliably.
- `--format`: `webm` (default) or `mp4` when using the ffmpeg encoder.
- `--fps`: output frame rate for the ffmpeg encoder. Defaults to `15` for faster export; pass `30` for the browser export cadence.
- `--frame-format`: intermediate frame format for the ffmpeg encoder. Defaults to high-quality `jpeg` for speed; pass `png` for lossless intermediate frames.
- `--concurrency`: parallel frame renderers for the ffmpeg encoder. Defaults to `4`.
- `--scale`: output resolution scale for the ffmpeg encoder. Defaults to `1` (960×540); pass `2` for 1920×1080.
- `--no-auto-zoom`: disable the auto-zoom camera animation.

The default output is a WebM video (960×540) rendered at 15fps with high-quality JPEG intermediate frames and a 2Mbps VP8 bitrate. When `--scale` is increased, the WebM bitrate scales with the output pixel area (`--scale 2` uses 8Mbps). To produce MP4, pass `--format mp4` or a `--name` ending in `.mp4`. To prioritize smoothness over speed, pass `--fps 30`; to prioritize lossless intermediate frames over speed, pass `--frame-format png`; to prioritize sharpness over speed and file size, pass `--scale 2`.

When the input is an HTML report, screenshots are preserved automatically; a dump JSON only renders embedded screenshots, so prefer the HTML input when screenshots are stored as separate files. The report must be generated with a current Midscene template that includes the video export hook; older report HTML files should be regenerated before exporting video.

## Parse With The JavaScript SDK

If you prefer to control report parsing in code, use `splitReportFile`, `reportFileToMarkdown`, and `mergeReportFiles` from `@midscene/core`.

```ts
import {
  mergeReportFiles,
  reportFileToMarkdown,
  splitReportFile,
} from '@midscene/core';

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

`splitReportFile`, `reportFileToMarkdown`, and `mergeReportFiles` serve different outputs:

- `splitReportFile` generates JSON files for the original structured objects (one `*.execution.json` per execution). The JSON keeps the raw `ReportActionDump`-style data and exports screenshots alongside it. The returned `executionJsonFiles` and `screenshotFiles` are lists of generated file paths.
- `reportFileToMarkdown` converts the same report into human-readable Markdown and exports the screenshots referenced by that Markdown. The returned `markdownFiles` contains the generated Markdown file paths.
- `mergeReportFiles` combines several report files into one merged HTML report. It is a thin wrapper over [`ReportMergingTool`](./api#new-reportmergingtool) that derives `testTitle`/`testDescription` from each source report's `groupName` automatically. Use it when you run multiple CLI actions or tests and want to consolidate their reports.


## About Fields In JSON And Markdown

The parsed JSON and Markdown structures may change as Midscene evolves. Use the actual conversion result as the source of truth.
