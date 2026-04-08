# Consume Report Files

Midscene HTML report files capture the full execution history of a single Agent, making them useful for replay and debugging.

Starting in v1.7.0, you can extract raw screenshots and JSON data from a report file, or convert the report into Markdown so other tools can consume it.

## Example

With the CLI, you can parse a report file into a Markdown file like this:

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

## About Fields In JSON And Markdown

The parsed JSON and Markdown structures may change as Midscene evolves. Use the actual conversion result as the source of truth.
