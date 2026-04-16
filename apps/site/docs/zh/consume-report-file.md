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

## 使用 JavaScript SDK 解析

如果你希望在代码里控制报告解析，可以使用 `@midscene/core` 提供的 `splitReportFile` 和 `reportFileToMarkdown`。

```ts
import { reportFileToMarkdown, splitReportFile } from '@midscene/core';

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
```

## 关于 JSON 和 Markdown 的内容字段

解析得到的 JSON 和 Markdown 数据结构可能会随着 Midscene 版本演进而变化，请以实际转换结果为准。
