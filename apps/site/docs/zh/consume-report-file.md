# 解析报告文件（Beta）

Midscene 的 HTML 报告文件记录了单个 Agent 运行过程中的完整信息，方便开发者回放和排查问题。

从 v1.7.0 开始，你可以把报告文件中的原始截图和 JSON 数据提取出来，或者把报告转录为 Markdown，方便其他工具继续消费这些内容。

## 示例

下面展示一个 Demo：通过 [Remotion Skill](https://www.remotion.dev/docs/ai/skills?utm_source=midscenejs) 解析 Midscene 导出的 Markdown 报告，并生成一个个性化的回放视频。

安装 Skills 后，可以使用类似下面的提示词：

```text
根据 report.md 文件中的内容，生成一个炫酷的 Remotion 回放视频。
```

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

## 关于 JSON 和 Markdown 的内容字段

由报告文件解析得到的 JSON 和 Markdown 数据结构，可能会随着 Midscene 版本演进而变化。
