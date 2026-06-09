# 解析报告文件

Midscene 的 HTML 报告文件记录了单个 Agent 运行过程中的完整信息，用以回放和调试。

从 v1.7.0 开始，你可以把报告文件中的原始截图和 JSON 数据提取出来，或者把报告转录为 Markdown，方便其他工具继续消费这些内容。

## 示例

你可以把报告文件解析为这样一份 Markdown 文件：

```markdown
# Act - 搜索并播放 Midscene 相关的视频

- Execution start: 2026-04-08T02:13:04.795Z
- Task count: 21

## 1. Plan - 点击顶部的搜索框以激活输入
- Status: finished
- Start: 2026-04-08T02:13:04.845Z
- End: 2026-04-08T02:13:15.296Z
- Cost(ms): 10451
- Screen size: 2880 x 1536

![task-1](./screenshots/execution-1-task-1-f9fc3bf9-bdf6-48dd-abea-f8f29874d8c1.jpeg)

### Recorder
- #1 type=screenshot, ts=2026-04-08T02:13:15.296Z, timing=after-calling

![task-1](./screenshots/execution-1-task-1-c521b130-5037-4ed2-b70f-705e181d981a.jpeg)

## 2. Locate - 顶部带有“李维刚的日常”占位文字的搜索输入框
- Status: finished
- Start: 2026-04-08T02:13:15.305Z
- End: 2026-04-08T02:13:15.306Z
- Cost(ms): 1
- Screen size: 2880 x 1536
- Locate center: (1489, 71)

.....
```

进一步，你可以结合 [Remotion Skill](https://www.remotion.dev/docs/ai/skills?utm_source=midscenejs) 解析这份 Markdown 文件，并生成一个个性化的回放视频。

视频生成结果如下：

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/midscene-replay.mp4" height="300" controls></video>

## 使用命令行工具解析

报告解析工具包含在各个平台的命令行工具中，例如 `@midscene/web`、`@midscene/android` 等，对应的子命令为 `report-tool`。

将报告文件提取为 JSON 格式，并导出对应截图到 `output-data` 目录：

```shell
npx @midscene/web report-tool --action split --htmlPath ./midscene_run/report/puppeteer-2026/index.html --outputDir ./output-data
```

将报告文件转换为 Markdown 格式，并输出到 `output-markdown` 目录：

```shell
npx @midscene/web report-tool --action to-markdown --htmlPath ./midscene_run/report/puppeteer-2026/index.html --outputDir ./output-markdown
```

将多个报告文件合并为一份汇总报告：

```shell
npx @midscene/web report-tool --action merge-html \
  --htmlReport ./midscene_run/report/case-a/index.html \
  --htmlReport ./midscene_run/report/case-b.html \
  --outputDir ./merged --outputName all-cases
```

每多合并一份报告就重复一次 `--htmlReport`。`--outputDir` 和 `--outputName` 都是可选项，留空时合并后的报告会写入 Midscene 默认的报告目录、并生成自动文件名。已存在同名文件时使用 `--overwrite` 进行覆盖。

## 通过命令行生成回放视频

报告页面有一个「导出视频」按钮，可以把回放渲染成 `.webm` 文件。`@midscene/cli` 的 `report-video` 子命令能在命令行直接产出回放视频，无需在浏览器中打开报告，适合 CI 或批处理场景。它内部会驱动一个无头浏览器，并默认使用随 CLI 安装的 `@ffmpeg-installer/ffmpeg` 二进制进行逐帧编码，因此只随 `@midscene/cli` 提供（不在各平台 CLI 中）。

从已有的报告 HTML 生成视频。也支持 `html-and-external-assets` 生成的目录模式报告，可以传入报告目录或其中的 `index.html`：

```shell
npx @midscene/cli report-video --input ./midscene_run/report/puppeteer-2026/index.html --output ./videos --name my-replay
```

也可以传入 dump JSON 文件，而不是 HTML 报告：

```shell
npx @midscene/cli report-video --input ./output-data/some.execution.json --output ./videos
```

可用参数：

- `--input, -i`:报告 HTML（文件或目录）或 dump JSON 文件，必填。
- `--output, -o`:输出目录，留空时使用 Midscene 默认的报告目录。
- `--name`:输出文件名（不含扩展名），默认为 `midscene_replay`。
- `--index`:多分组报告中要渲染的 dump 分组序号，默认为 `0`。
- `--encoder`:编码器，可选 `ffmpeg`（默认）或 `media-recorder`。ffmpeg 会离线逐帧编码，更适合较长回放。
- `--format`:使用 ffmpeg 编码时的输出格式，可选 `webm`（默认）或 `mp4`。
- `--fps`:使用 ffmpeg 编码时的输出帧率，默认为 `15` 以提升导出速度；如需接近浏览器导出的流畅度，可传入 `30`。
- `--frame-format`:使用 ffmpeg 编码时的中间帧格式，默认为高质量 `jpeg` 以提升速度；如需无损中间帧，可传入 `png`。
- `--concurrency`:使用 ffmpeg 编码时的并行帧渲染器数量，默认为 `4`。
- `--scale`:使用 ffmpeg 编码时的输出分辨率倍率，默认为 `1`（960×540）；传入 `2` 可输出 1920×1080。
- `--no-auto-zoom`:关闭自动缩放的镜头动画。

默认输出为 WebM 视频（960×540），并以 15fps、高质量 JPEG 中间帧和 2Mbps VP8 码率渲染。当增大 `--scale` 时，WebM 码率会随输出像素面积同步增大（`--scale 2` 使用 8Mbps）。若需要 MP4，可传入 `--format mp4`，或让 `--name` 以 `.mp4` 结尾。若优先考虑流畅度而不是速度，可传入 `--fps 30`；若优先考虑无损中间帧而不是速度，可传入 `--frame-format png`；若优先考虑清晰度而不是速度和文件大小，可传入 `--scale 2`。

当输入为 HTML 报告时会自动保留截图;而 dump JSON 只会渲染内嵌的截图，因此当截图以独立文件存储时，建议使用 HTML 输入。报告需要由包含视频导出 hook 的当前 Midscene 模板生成；旧版报告 HTML 请先重新生成再导出视频。

## 使用 JavaScript SDK 解析

如果你希望在代码里控制报告解析，可以使用 `@midscene/core` 提供的 `splitReportFile`、`reportFileToMarkdown` 和 `mergeReportFiles`。

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

`splitReportFile`、`reportFileToMarkdown` 和 `mergeReportFiles` 的用途不同：

- `splitReportFile` 会产出“原始对象”对应的 JSON 文件（每个 execution 一个 `*.execution.json`），内容是 `ReportActionDump` 的原始结构化数据，同时会导出截图文件。返回值中的 `executionJsonFiles` 和 `screenshotFiles` 都是生成后的文件路径列表。
- `reportFileToMarkdown` 会把同一份报告转成更易读、便于给其他工具继续处理的 Markdown 文本，并导出 Markdown 里引用到的截图。返回值里的 `markdownFiles` 对应 Markdown 文件路径。
- `mergeReportFiles` 会把多份报告合并成一份汇总 HTML 报告，是 [`ReportMergingTool`](./api#new-reportmergingtool) 的轻量封装：会自动从每份源报告里读取 `groupName` 作为 `testTitle`/`testDescription`，省去了手工准备 `reportAttributes` 的步骤。命令行多次调用或多个测试用例产生多份报告后，使用它进行汇总最为合适。


## 关于 JSON 和 Markdown 的内容字段

解析得到的 JSON 和 Markdown 数据结构可能会随着 Midscene 版本演进而变化，请以实际转换结果为准。
